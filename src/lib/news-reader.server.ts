import { allowedNewsUrl, articleText } from "./news-content";
import { extractRuleFacts } from "./news-rules";

type Admin = (typeof import("@/lib/db/admin.server"))["supabaseAdmin"];
type Fact = { category: string; status: string; importance: number; impact: string; sentiment: "negative" | "positive" | "neutral" };
const categories = ["injury", "suspension", "transfer", "manager", "lineup", "match_report", "preview", "club_statement", "other"];

async function readableArticle(url: string, feed: string) {
  if (!allowedNewsUrl(url, feed)) throw new Error("Article URL is outside this publisher.");
  const origin = new URL(url).origin;
  const robots = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(8000) });
  if (robots.status === 401 || robots.status === 403) throw new Error("Publisher blocks automated access.");
  if (robots.ok) {
    let applies = false;
    const path = new URL(url).pathname;
    for (const line of (await robots.text()).split(/\r?\n/)) {
      const [key, ...rest] = line.split(":"); const value = rest.join(":").split("#")[0]?.trim() ?? "";
      if (key?.trim().toLowerCase() === "user-agent") applies = value === "*" || /footballintel/i.test(value);
      if (applies && key?.trim().toLowerCase() === "disallow" && value && path.startsWith(value.replace(/\*.*$/, ""))) throw new Error("Publisher disallows automated article reading.");
    }
  }
  let target = url;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(10000), headers: { "User-Agent": "FootballIntel/1.0 news reader" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Publisher returned an empty redirect.");
      target = new URL(location, target).href;
      if (!allowedNewsUrl(target, feed)) throw new Error("Publisher redirected outside its website.");
      continue;
    }
    if (!response.ok) throw new Error(`Article unavailable (HTTP ${response.status}).`);
    if (!response.headers.get("content-type")?.includes("text/html")) throw new Error("Publisher did not return an article page.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Article page is empty.");
    const decoder = new TextDecoder(); let html = "", bytes = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 2_000_000) { await reader.cancel(); throw new Error("Article page exceeds the safe reading limit."); }
      html += decoder.decode(part.value, { stream: true });
    }
    const text = articleText(html + decoder.decode());
    if (text.length < 200) throw new Error("Full article text is not publicly available; using the feed only.");
    return text;
  }
  throw new Error("Too many publisher redirects.");
}

/** One durable oldest-first queue, shared by scheduled and manual news refreshes. */
export async function readDetailedNews(sb: Admin, teams: Array<{ id: string; names: string[] }>, link: (text: string, teams: Array<{ id: string; names: string[] }>) => string[]) {
  // No AI key needed: reading is rule-based and free.
  const token = crypto.randomUUID();
  const { data: acquired, error: lockError } = await sb.rpc("acquire_news_reader", { p_token: token });
  if (lockError) throw lockError;
  if (!acquired) return { analyzed: 0, message: "News reading is already running.", changedTeams: [] as string[] };
  let analyzed = 0, calls = 0; const changedTeams = new Set<string>(); const started = Date.now();
  try {
    const { data: state } = await sb.from("news_reader_state").select("pause_kind,message,retry_after").eq("id", "news").single();
    if (state?.pause_kind === "provider_denial" || state?.pause_kind === "refusal" || state?.pause_kind === "configuration") return { analyzed, message: state.message ?? "News reading is paused.", changedTeams: [] };
    if (state?.retry_after && new Date(state.retry_after).getTime() > Date.now()) return { analyzed, message: state.message ?? "News reading is paused.", changedTeams: [] };
    // Workspace credits/policy: at most one probe item per later run, never an immediate retry.
    const probing = state?.pause_kind === "workspace";
    const { data: rows, error } = await sb.from("news_articles").select("id,title,summary,canonical_url,source_id,article_text,content_status,news_facts,team_ids")
      .is("detailed_analyzed_at", null).order("ingested_at").order("id").limit(probing ? 1 : 5);
    if (error) throw error;
    const { data: sources } = await sb.from("news_sources").select("id,feed_url");
    for (const row of rows ?? []) {
      if (calls >= 12 || Date.now() - started > 90_000) break;
      let text = row.article_text ?? "", status = row.content_status ?? "", contentError: string | null = null;
      if (!status) {
        try {
          const feed = sources?.find((s) => s.id === row.source_id)?.feed_url;
          if (!feed) throw new Error("Publisher feed is missing.");
          text = await readableArticle(row.canonical_url, feed);
          status = text.length > 60_000 ? "partial" : "full"; text = text.slice(0, 60_000);
        } catch (e) { status = "feed_only"; contentError = e instanceof Error ? e.message : "Article unavailable."; }
        const { error: writeError } = await sb.from("news_articles").update({ article_text: text || null, content_status: status, content_error: contentError, content_fetched_at: new Date().toISOString() }).eq("id", row.id);
        if (writeError) throw writeError;
      }
      // Free rule-based reading: no AI credits spent.
      calls++;
      const facts: Fact[] = extractRuleFacts(`${row.title}. ${text || row.summary || ""}`);
      const ids = [...new Set([...(row.team_ids ?? []), ...link(`${row.title} ${text} ${facts.map((f) => f.impact).join(" ")}`, teams)])];
      const top = [...facts].sort((a, b) => b.importance - a.importance)[0];
      const now = new Date().toISOString();
      const { error: writeError } = await sb.from("news_articles").update({ news_facts: facts.map((f) => ({ ...f, team_ids: link(f.impact, teams) })) as never, team_ids: ids,
        category: top?.category ?? "other", status: top?.status ?? "reported", importance: top?.importance ?? 1,
        impact: top?.impact ?? "No match-relevant details in the available text.", analyzed_at: now, detailed_analyzed_at: now, analysis_error: null }).eq("id", row.id).is("detailed_analyzed_at", null);
      if (writeError) throw writeError;
      analyzed++; ids.forEach((id) => changedTeams.add(id));
      await sb.from("news_reader_state").update({ pause_kind: null, message: null, retry_after: null, updated_at: now }).eq("id", "news").eq("lease_token", token);
      if (probing) break;
    }
    return { analyzed, changedTeams: [...changedTeams] };
  } catch (e) {
    const message = e instanceof Error ? e.message : "News reading failed.";
    await sb.from("news_reader_state").update({ pause_kind: "transient", message, retry_after: new Date(Date.now() + 900000).toISOString(), updated_at: new Date().toISOString() }).eq("id", "news").eq("lease_token", token);
    return { analyzed, message, changedTeams: [...changedTeams] };
  } finally {
    await sb.from("news_reader_state").update({ lease_until: null, lease_token: null }).eq("id", "news").eq("lease_token", token);
  }
}