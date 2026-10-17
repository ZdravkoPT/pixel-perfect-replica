/** RSS ingestion and queued detailed news reading. Never invents article content. */

export type FeedItem = { title: string; link: string; summary: string | null; published: string | null };

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();

const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decode(m[1] ?? "") : null;
};

export function parseRss(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const title = tag(b, "title");
    const link = tag(b, "link") ?? tag(b, "guid");
    if (!title || !link || !/^https?:\/\//.test(link)) continue;
    const pub = tag(b, "pubDate") ?? tag(b, "dc:date");
    const d = pub ? new Date(pub) : null;
    const summary = tag(b, "description");
    items.push({ title, link, summary: summary ? summary : null, published: d && !isNaN(d.getTime()) ? d.toISOString() : null });
  }
  return items;
}

/** Strips tracking params, fragments and trailing slashes so one story is stored once. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|at_|cmp|ito|ocid|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.protocol = "https:";
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9а-я ]/g, " ").replace(/\s+/g, " ").trim();

/** Team ids whose name or alias appears as whole words in the text. Names under 4 letters are ignored. */
export function linkTeams(text: string, teams: Array<{ id: string; names: string[] }>): string[] {
  const t = ` ${norm(text)} `;
  const out: string[] = [];
  for (const team of teams) if (team.names.some((n) => n.length >= 4 && t.includes(` ${n} `))) out.push(team.id);
  return out;
}

export function storyKey(title: string): string {
  const stop = new Set(["the", "a", "an", "to", "of", "in", "on", "for", "and", "with", "after", "as", "at", "is", "be", "by"]);
  return norm(title).split(" ").filter((w) => w.length > 2 && !stop.has(w)).sort().slice(0, 6).join("-");
}

async function loadTeams(sb: Awaited<ReturnType<typeof admin>>) {
  const map = new Map<string, Set<string>>();
  for (let from = 0; ; from += 1000) {
    const { data: t, error } = await sb.from("teams").select("id, name, short_name").order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of t ?? []) map.set(r.id, new Set([norm(r.name), ...(r.short_name ? [norm(r.short_name)] : [])]));
    if (!t || t.length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data: a, error } = await sb.from("team_aliases").select("team_id, normalized_alias").order("team_id").order("normalized_alias").range(from, from + 999);
    if (error) throw error;
    for (const r of a ?? []) map.get(r.team_id)?.add(norm(r.normalized_alias));
    if (!a || a.length < 1000) break;
  }
  return [...map].map(([id, s]) => ({ id, names: [...s].filter((n) => !/^(fc|cf|sc|ac)$/.test(n)) }));
}

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export async function refreshNews(): Promise<{ sources: Array<{ id: string; ok: boolean; items: number; inserted: number; error?: string }>; analyzed: number; message?: string }> {
  const sb = await admin();
  const { data: sources } = await sb.from("news_sources").select("*").eq("enabled", true);
  const teams = await loadTeams(sb);
  const out = [];
  for (const s of sources ?? []) {
    try {
      const res = await fetch(s.feed_url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0 (FootballIntel news reader)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseRss(await res.text());
      if (items.length === 0) throw new Error("Feed returned no articles");
      const rows = items.map((it) => ({
        source_id: s.id, canonical_url: canonicalUrl(it.link), title: it.title, summary: it.summary,
        language: s.language, published_at: it.published, team_ids: linkTeams(`${it.title} ${it.summary ?? ""}`, teams), story_key: storyKey(it.title),
      }));
      const { data: ins, error } = await sb.from("news_articles").upsert(rows, { onConflict: "canonical_url", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      await sb.from("news_sources").update({ last_success_at: new Date().toISOString(), last_count: items.length }).eq("id", s.id);
      out.push({ id: s.id, ok: true, items: items.length, inserted: ins?.length ?? 0 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from("news_sources").update({ last_error_at: new Date().toISOString(), last_error: msg.slice(0, 300) }).eq("id", s.id);
      out.push({ id: s.id, ok: false, items: 0, inserted: 0, error: msg });
    }
  }
  const { readDetailedNews } = await import("./news-reader.server");
  const result = await readDetailedNews(sb, teams, linkTeams);
  // Every new linked detail invalidates upcoming match evidence, not only breaking headlines.
  if (result.changedTeams.length) {
    const { error } = await sb.from("analyst_reports").update({ generated_at: "1970-01-01T00:00:00.000Z" })
      .in("match_id", (await sb.from("matches").select("id")
        .or(`home_team_id.in.(${result.changedTeams.join(",")}),away_team_id.in.(${result.changedTeams.join(",")})`)
        .gte("kickoff_at", new Date().toISOString()).lte("kickoff_at", new Date(Date.now() + 7 * 864e5).toISOString())).data?.map((m) => m.id) ?? []);
    if (error) console.error("news evidence invalidation failed", error.message);
    try {
      const { refreshMatchPicks } = await import("./match-picks.server");
      await refreshMatchPicks();
    } catch (e) { console.error("news-driven picks refresh failed", e); }
  }
  return { sources: out, analyzed: result.analyzed, ...(result.message ? { message: result.message } : {}) };
}
