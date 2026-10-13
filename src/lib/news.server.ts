/** RSS news ingestion, team linking and AI tagging. Headline + summary only; never invents articles. */

export type FeedItem = { title: string; link: string; summary: string | null; published: string | null };

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();

const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decode(m[1]) : null;
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
    items.push({ title, link, summary: summary ? summary.slice(0, 500) : null, published: d && !isNaN(d.getTime()) ? d.toISOString() : null });
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
  const { data: upcoming } = await sb.from("matches").select("home_team_id, away_team_id")
    .gte("kickoff_at", new Date(Date.now() - 2 * 864e5).toISOString()).lte("kickoff_at", new Date(Date.now() + 14 * 864e5).toISOString()).limit(2000);
  const ids = [...new Set((upcoming ?? []).flatMap((m) => [m.home_team_id, m.away_team_id]))];
  if (ids.length === 0) return [];
  const map = new Map<string, Set<string>>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: t } = await sb.from("teams").select("id, name, short_name").in("id", chunk);
    for (const r of t ?? []) map.set(r.id, new Set([norm(r.name), ...(r.short_name ? [norm(r.short_name)] : [])]));
    const { data: a } = await sb.from("team_aliases").select("team_id, normalized_alias").in("team_id", chunk);
    for (const r of a ?? []) map.get(r.team_id)?.add(norm(r.normalized_alias));
  }
  return [...map].map(([id, s]) => ({ id, names: [...s].filter((n) => !/^(fc|cf|sc|ac)$/.test(n)) }));
}

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export async function refreshNews(): Promise<{ sources: Array<{ id: string; ok: boolean; items: number; inserted: number; error?: string }>; analyzed: number }> {
  const sb = await admin();
  const { data: sources } = await sb.from("news_sources").select("*").eq("enabled", true);
  const teams = await loadTeams(sb);
  const out = [];
  for (const s of sources ?? []) {
    try {
      const res = await fetch(s.feed_url, { headers: { "User-Agent": "Mozilla/5.0 (FootballIntel news reader)" } });
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
  const analyzed = await analyzeNews(sb).catch((e) => { console.error("news analysis failed", e); return 0; });
  return { sources: out, analyzed };
}

const CATEGORIES = ["injury", "suspension", "transfer", "manager", "lineup", "match_report", "preview", "club_statement", "other"] as const;

/** Tags up to 25 unanalysed articles per run (headline + summary only). Stops on gateway credit/permission errors. */
async function analyzeNews(sb: Awaited<ReturnType<typeof admin>>): Promise<number> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return 0;
  const { data: rows } = await sb.from("news_articles").select("id, title, summary").is("analyzed_at", null)
    .order("published_at", { ascending: false, nullsFirst: false }).limit(25);
  if (!rows || rows.length === 0) return 0;
  const schema = {
    type: "object", additionalProperties: false, required: ["items"],
    properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["i", "category", "status", "importance", "impact"],
      properties: { i: { type: "integer" }, category: { type: "string", enum: [...CATEGORIES] }, status: { type: "string", enum: ["official", "reported", "rumour"] },
        importance: { type: "integer", minimum: 1, maximum: 5 }, impact: { type: "string" } } } } },
  };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra", reasoning_effort: "low",
      response_format: { type: "json_schema", json_schema: { name: "news_tags", strict: true, schema } },
      messages: [
        { role: "system", content: "Classify football news using ONLY the headline and summary given. status: official = club/league confirmed, reported = journalist reports it as fact, rumour = speculation. importance 1-5 for impact on upcoming matches. impact: one short English sentence, no invented facts. Return one item per input index." },
        { role: "user", content: rows.map((r, i) => `${i}. ${r.title}${r.summary ? ` — ${r.summary.slice(0, 280)}` : ""}`).join("\n") },
      ],
    }),
  });
  if (!res.ok) { console.error("news AI", res.status, (await res.text()).slice(0, 200)); return 0; }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as { items?: Array<{ i: number; category: string; status: string; importance: number; impact: string }> };
  let n = 0;
  const now = new Date().toISOString();
  for (const it of parsed.items ?? []) {
    const r = rows[it.i];
    if (!r) continue;
    await sb.from("news_articles").update({ category: it.category, status: it.status, importance: Math.min(5, Math.max(1, it.importance)), impact: it.impact.slice(0, 240), analyzed_at: now }).eq("id", r.id);
    n++;
  }
  return n;
}
