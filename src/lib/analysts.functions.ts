import { createServerFn } from "@tanstack/react-start";
import { publicClient } from "./leagues.functions";
import { buildChecklist } from "./checklist.functions";
import { newsOpinion, type NewsOpinion } from "./models/news-opinion";

/**
 * Six analyst reports per match, written by AI from stored evidence only.
 * Reports never change probabilities; the Market analyst reports that no odds are used.
 */

export type AnalystReport = {
  role: string;
  summary: string;
  findings: string[];
  evidence: string[];
  missing: string[];
  leaning: "home" | "draw" | "away" | "none";
};
export type AnalystBundle = { reports: AnalystReport[]; generatedAt: string | null; status: "ok" | "unavailable"; message?: string };

const ROLES = ["Statistics", "Squad", "Tactical", "Risk", "Market", "Chief"] as const;
const MAX_AGE_MS = 6 * 3600e3;

export async function gatherEvidence(matchId: string) {
  const sb = publicClient();
  const { data: m } = await sb.from("matches").select("id, kickoff_at, status, home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name), league:leagues(name)").eq("id", matchId).maybeSingle();
  if (!m) return null;
  const home = (m.home as { name: string } | null)?.name ?? "Home";
  const away = (m.away as { name: string } | null)?.name ?? "Away";
  const [checklist, cache, news, stats] = await Promise.all([
    buildChecklist(matchId),
    sb.from("match_picks_cache").select("payload").eq("id", "latest").maybeSingle(),
    sb.from("news_articles").select("title, status, category, importance, impact, team_ids, published_at").overlaps("team_ids", [m.home_team_id, m.away_team_id])
      .gte("published_at", new Date(new Date(m.kickoff_at).getTime() - 7 * 864e5).toISOString()).order("published_at", { ascending: false }).limit(10),
    sb.from("team_match_stats").select("team_id, possession, shots, shots_on_target, corners, fouls, matches!inner(kickoff_at)")
      .in("team_id", [m.home_team_id, m.away_team_id]).lt("matches.kickoff_at", m.kickoff_at).limit(40),
  ]);
  const payload = cache.data?.payload as { picks?: Array<Record<string, unknown>>; noBets?: Array<Record<string, unknown>> } | undefined;
  const pick = payload?.picks?.find((p) => p["matchId"] === matchId) ?? null;
  const noBet = payload?.noBets?.find((p) => p["matchId"] === matchId) ?? null;
  const avg = (team: string, k: string) => {
    const v = (stats.data ?? []).filter((r) => r.team_id === team).map((r) => (r as unknown as Record<string, unknown>)[k]).filter((x): x is number => typeof x === "number");
    return v.length >= 3 ? { avg: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100, games: v.length } : null;
  };
  const style = Object.fromEntries(["possession", "shots", "shots_on_target", "corners", "fouls"].map((k) => [k, { [home]: avg(m.home_team_id, k), [away]: avg(m.away_team_id, k) }]));
  return {
    match: { home, away, league: (m.league as { name: string } | null)?.name ?? null, kickoff: m.kickoff_at, status: m.status },
    checklist: checklist.map((c) => `${c.label}: ${c.value}`),
    aiPick: pick ? { selection: pick["selection"], probability: pick["probability"], confidence: pick["confidence"], reasons: pick["reasons"] } : null,
    noBet: noBet ? { reason: noBet["noBetReason"] ?? noBet["reason"] ?? null, bestCandidate: noBet["selection"] ?? null } : null,
    recentStatAverages: style,
    newsOpinion: newsOpinion((news.data ?? []) as never, m.home_team_id, m.away_team_id, home, away),
    news: (news.data ?? []).map((n) => ({ title: n.title, status: n.status, category: n.category, impact: n.impact })),
  };
}

const schema = {
  type: "object", additionalProperties: false, required: ["reports"],
  properties: {
    reports: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["role", "summary", "findings", "evidence", "missing", "leaning"],
        properties: {
          role: { type: "string", enum: [...ROLES] },
          summary: { type: "string" },
          findings: { type: "array", items: { type: "string" } },
          evidence: { type: "array", items: { type: "string" } },
          missing: { type: "array", items: { type: "string" } },
          leaning: { type: "string", enum: ["home", "draw", "away", "none"] },
        },
      },
    },
  },
};

const SYSTEM = `You are a panel of six football analysts. Use ONLY the JSON evidence given (newsOpinion is the per-team news read; rumours never count); never invent numbers, players, injuries or facts. If something is not in the evidence, list it under "missing".
Write exactly one report per role, in this order:
- Statistics: recent stat averages, Elo, form, table from the checklist and pick reasons.
- Squad: line-ups, players out, key-player form, squad news.
- Tactical: playing-style averages (possession, shots, corners, fouls), formation notes in reasons, referee.
- Risk: what could make the AI pick wrong — thin evidence, uncertainty, rest days, weather, travel, contradictory news.
- Market: state plainly that this app uses no bookmaker odds by design, so there is no market view; leaning "none"; findings may only restate that.
- Chief: weigh the other five, name the strongest evidence and the strongest counter-argument; it may disagree with the AI pick but cannot change any probability.
Analysts may disagree. findings: 2-4 short sentences. evidence: short quotes of the numbers used. Plain English.`;

export const getAnalystReports = createServerFn({ method: "GET" })
  .inputValidator((d: { matchId: string }) => d)
  .handler(async ({ data }): Promise<AnalystBundle> => {
    const sb = publicClient();
    const { data: cached } = await sb.from("analyst_reports").select("reports, generated_at").eq("match_id", data.matchId).maybeSingle();
    if (cached && Date.now() - new Date(cached.generated_at).getTime() < MAX_AGE_MS) {
      return { reports: cached.reports as unknown as AnalystReport[], generatedAt: cached.generated_at, status: "ok" };
    }
    const stale = cached ? { reports: cached.reports as unknown as AnalystReport[], generatedAt: cached.generated_at } : null;
    const key = process.env["LOVABLE_API_KEY"];
    const evidence = await gatherEvidence(data.matchId);
    if (!key || !evidence) return { ...(stale ?? { reports: [], generatedAt: null }), status: "unavailable", message: evidence ? "AI is not configured." : "Match not found." };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra", reasoning_effort: "low",
        response_format: { type: "json_schema", json_schema: { name: "analyst_reports", strict: true, schema } },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(evidence) }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("analysts AI", res.status, body.slice(0, 200));
      const message = res.status === 402 ? "AI credits have run out — reports will return once credits are added."
        : res.status === 429 ? "AI is busy right now — try again in a minute." : "The analysts could not be reached right now.";
      return { ...(stale ?? { reports: [], generatedAt: null }), status: "unavailable", message };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    let reports: AnalystReport[] = [];
    try { reports = (JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as { reports?: AnalystReport[] }).reports ?? []; } catch { reports = []; }
    if (reports.length === 0) return { ...(stale ?? { reports: [], generatedAt: null }), status: "unavailable", message: "The analysts returned nothing usable." };
    reports = reports.map((r) => r.role === "Market" ? { ...r, leaning: "none" } : r);
    const generatedAt = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("analyst_reports").upsert({ match_id: data.matchId, reports: reports as never, evidence: evidence as never, model: "openai/gpt-6-astra", generated_at: generatedAt });
    return { reports, generatedAt, status: "ok" };
  });

/** The news read for one match, shown on the AI Prediction and AI review tabs. */
export const getMatchNewsOpinion = createServerFn({ method: "GET" })
  .inputValidator((d: { matchId: string }) => d)
  .handler(async ({ data }): Promise<NewsOpinion | null> => (await gatherEvidence(data.matchId))?.newsOpinion ?? null);
