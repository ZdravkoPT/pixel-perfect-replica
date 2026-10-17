import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicClient } from "./leagues.functions";

export type NewsItem = {
  id: string; title: string; summary: string | null; url: string; source: string; sourceName: string; language: string;
  publishedAt: string | null; category: string | null; status: string | null; importance: number | null; impact: string | null;
  teams: Array<{ id: string; name: string }>; storyKey: string | null; alsoIn: Array<{ source: string; url: string }>;
};

const filters = z.object({
  q: z.string().max(100).optional(), source: z.string().max(40).optional(), language: z.enum(["en", "bg"]).optional(),
  category: z.string().max(40).optional(), hours: z.number().int().min(1).max(720).optional(), breaking: z.boolean().optional(),
  teamIds: z.array(z.string().uuid()).max(4).optional(), limit: z.number().int().min(1).max(200).optional(),
});

export const listNews = createServerFn({ method: "GET" })
  .inputValidator((d: z.infer<typeof filters>) => filters.parse(d))
  .handler(async ({ data }): Promise<{ items: NewsItem[] }> => {
    const sb = publicClient();
    let q = sb.from("news_articles").select("id, title, summary, canonical_url, source_id, language, published_at, category, status, importance, impact, team_ids, story_key, source:news_sources(name)")
      .order("published_at", { ascending: false, nullsFirst: false }).limit(data.limit ?? 120);
    if (data.q && data.q.trim().length >= 2) q = q.ilike("title", `%${data.q.trim().replace(/[%_]/g, "")}%`);
    if (data.source) q = q.eq("source_id", data.source);
    if (data.language) q = q.eq("language", data.language);
    if (data.category) q = q.eq("category", data.category);
    if (data.hours) q = q.gte("published_at", new Date(Date.now() - data.hours * 36e5).toISOString());
    if (data.breaking) q = q.gte("importance", 4).neq("status", "rumour");
    if (data.teamIds?.length) q = q.overlaps("team_ids", data.teamIds);
    const { data: rows } = await q;
    const all = rows ?? [];
    const teamIds = [...new Set(all.flatMap((r) => r.team_ids ?? []))];
    const names = new Map<string, string>();
    if (teamIds.length) {
      const { data: t } = await sb.from("teams").select("id, name").in("id", teamIds.slice(0, 500));
      for (const r of t ?? []) names.set(r.id, r.name);
    }
    // Group the same story across sources: keep the newest, list the rest as "also in".
    const seen = new Map<string, NewsItem>();
    const items: NewsItem[] = [];
    for (const r of all) {
      const key = r.story_key && r.story_key.split("-").length >= 4 ? r.story_key : null;
      const src = (r.source as { name: string } | null)?.name ?? r.source_id;
      const existing = key ? seen.get(key) : null;
      if (existing) { existing.alsoIn.push({ source: src, url: r.canonical_url }); continue; }
      const item: NewsItem = {
        id: r.id, title: r.title, summary: r.summary, url: r.canonical_url, source: r.source_id, sourceName: src, language: r.language,
        publishedAt: r.published_at, category: r.category, status: r.status, importance: r.importance, impact: r.impact,
        teams: (r.team_ids ?? []).map((id) => ({ id, name: names.get(id) ?? "" })).filter((t) => t.name), storyKey: key, alsoIn: [],
      };
      if (key) seen.set(key, item);
      items.push(item);
    }
    return { items };
  });

export const listNewsSources = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await publicClient().from("news_sources").select("id, name, feed_url, language, enabled, last_success_at, last_error_at, last_error, last_count").order("language").order("name");
  return data ?? [];
});

/** Anyone may trigger a refresh, but at most once every 5 minutes. */
export const refreshNewsNow = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("news_sources").select("last_success_at").order("last_success_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  if (data?.last_success_at && Date.now() - new Date(data.last_success_at).getTime() < 5 * 60_000) return { skipped: true as const };
  const { refreshNews } = await import("./news.server");
  const r = await refreshNews();
  return { skipped: false as const, inserted: r.sources.reduce((a, s) => a + s.inserted, 0), message: r.message };
});

export const getNewsReaderStatus = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const [state, pending, read, full] = await Promise.all([
    sb.from("news_reader_state").select("pause_kind,message,updated_at").eq("id", "news").maybeSingle(),
    sb.from("news_articles").select("id", { count: "exact", head: true }).is("detailed_analyzed_at", null),
    sb.from("news_articles").select("id", { count: "exact", head: true }).not("detailed_analyzed_at", "is", null),
    sb.from("news_articles").select("id", { count: "exact", head: true }).eq("content_status", "full"),
  ]);
  return { message: state.data?.message, paused: !!state.data?.pause_kind, pending: pending.count ?? 0, read: read.count ?? 0, full: full.count ?? 0 };
});

export const getTeamNewsOpinion = createServerFn({ method: "GET" })
  .inputValidator((d: { teamId: string }) => z.object({ teamId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: team } = await sb.from("teams").select("name").eq("id", data.teamId).maybeSingle();
    const { data: rows } = await sb.from("news_articles").select("title,category,status,importance,impact,team_ids,published_at,news_facts,detailed_analyzed_at")
      .contains("team_ids", [data.teamId]).gte("published_at", new Date(Date.now() - 7 * 864e5).toISOString()).lte("published_at", new Date().toISOString()).order("published_at", { ascending: false }).limit(500);
    const { newsOpinion } = await import("./models/news-opinion");
    return newsOpinion(rows ?? [], data.teamId, "", team?.name ?? "Team", "");
  });

const REVIEW = new Set(["injury", "suspension", "manager", "lineup"]);
/** News linked to either side of a match from the 7 days before kickoff. */
export const getMatchNews = createServerFn({ method: "GET" })
  .inputValidator((d: { matchId: string }) => z.object({ matchId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: m } = await sb.from("matches").select("home_team_id, away_team_id, kickoff_at").eq("id", data.matchId).maybeSingle();
    if (!m) return { items: [] as NewsItem[], needsReview: [] as string[] };
    const ko = new Date(m.kickoff_at).getTime();
    const { data: rows } = await sb.from("news_articles").select("id, title, summary, canonical_url, source_id, language, published_at, category, status, importance, impact, team_ids, story_key, source:news_sources(name)")
      .overlaps("team_ids", [m.home_team_id, m.away_team_id]).gte("published_at", new Date(ko - 7 * 864e5).toISOString())
      .lte("published_at", new Date(ko + 864e5).toISOString()).order("published_at", { ascending: false }).limit(40);
    const items: NewsItem[] = (rows ?? []).map((r) => ({
      id: r.id, title: r.title, summary: r.summary, url: r.canonical_url, source: r.source_id, sourceName: (r.source as { name: string } | null)?.name ?? r.source_id,
      language: r.language, publishedAt: r.published_at, category: r.category, status: r.status, importance: r.importance, impact: r.impact,
      teams: [], storyKey: r.story_key, alsoIn: [],
    }));
    const needsReview = items.filter((i) => i.category && REVIEW.has(i.category) && i.status !== "rumour" && (i.importance ?? 0) >= 3).map((i) => i.title);
    return { items, needsReview };
  });
