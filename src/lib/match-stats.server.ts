import type { MatchFacts } from "./providers/fotmob.server";

/**
 * Imports real per-team box-score statistics (possession, shots, corners,
 * fouls, cards, offsides, passes, pass accuracy) from FotMob match details
 * for recently finished fixtures into team_match_stats.
 */
function num(text: string | undefined): number | null {
  if (!text) return null;
  const m = /-?\d+(\.\d+)?/.exec(text);
  return m ? Number(m[0]) : null;
}
function pctIn(text: string | undefined): number | null {
  if (!text) return null;
  const m = /\((\d+(?:\.\d+)?)%\)/.exec(text);
  return m ? Number(m[1]) : null;
}

export function parseBoxScore(facts: MatchFacts) {
  const find = (...titles: string[]) => {
    for (const group of facts.statGroups) {
      for (const item of group.items) {
        const t = item.title.toLowerCase();
        if (titles.some((x) => t === x)) return item;
      }
    }
    return null;
  };
  const side = (key: "home" | "away") => {
    const g = (...t: string[]) => find(...t)?.[key];
    const accurate = g("accurate passes");
    return {
      possession: num(g("ball possession", "possession")),
      shots: num(g("total shots", "shots")),
      shots_on_target: num(g("shots on target")),
      corners: num(g("corners", "corner kicks")),
      fouls: num(g("fouls committed", "fouls")),
      offsides: num(g("offsides")),
      yellow_cards: num(g("yellow cards")),
      red_cards: num(g("red cards")),
      passes: num(g("passes", "total passes")),
      pass_accuracy: pctIn(accurate),
    };
  };
  const home = side("home");
  const away = side("away");
  const any = Object.values(home).some((v) => v != null);
  return any ? { home, away } : null;
}

/** Real expected goals per side from FotMob's stat groups; null when the feed has none. */
export function parseXg(facts: MatchFacts): { home: number; away: number } | null {
  for (const group of facts.statGroups) {
    for (const item of group.items) {
      const t = item.title.toLowerCase();
      if (t === "expected goals (xg)" || t === "expected goals" || t === "xg") {
        const h = num(item.home), a = num(item.away);
        if (h != null && a != null) return { home: h, away: a };
      }
    }
  }
  return null;
}

async function saveXg(
  db: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  m: { id: string; home_team_id: string; away_team_id: string },
  xg: { home: number; away: number },
) {
  await db.from("team_xg").upsert(
    [
      { match_id: m.id, team_id: m.home_team_id, xg: xg.home, xg_against: xg.away, source: "fotmob" },
      { match_id: m.id, team_id: m.away_team_id, xg: xg.away, xg_against: xg.home, source: "fotmob" },
    ],
    { onConflict: "match_id,team_id" },
  );
}

/** Backfills xG for finished matches that already have a FotMob id but no xG row. */
export async function backfillXg(opts: { limit?: number; budgetMs?: number } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 60_000);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { FotmobProvider } = await import("./providers/fotmob.server");
  const fotmob = new FotmobProvider();
  const { data: have } = await supabaseAdmin.from("team_xg").select("match_id").limit(20000);
  const done = new Set((have ?? []).map((r) => r.match_id));
  const { data: srcs } = await supabaseAdmin
    .from("match_sources")
    .select("match_id, provider_match_id, match:matches!inner(id, status, home_team_id, away_team_id)")
    .eq("source_id", "fotmob")
    .eq("match.status", "FINISHED")
    .limit(5000);
  const todo = (srcs ?? []).filter((s) => !done.has(s.match_id)).slice(0, opts.limit ?? 60);
  let saved = 0, missing = 0;
  for (const s of todo) {
    if (Date.now() > deadline) break;
    const m = (s as unknown as { match: { id: string; home_team_id: string; away_team_id: string } }).match;
    try {
      const res = await fotmob.getMatchFacts(s.provider_match_id);
      const xg = res.ok ? parseXg(res.data) : null;
      if (xg) { await saveXg(supabaseAdmin, m, xg); saved += 1; } else missing += 1;
      await new Promise((r) => setTimeout(r, 120));
    } catch { missing += 1; }
  }
  return { candidates: todo.length, saved, missing };
}

export async function ingestMatchStats(opts: { days?: number; limit?: number; triggeredBy?: string; budgetMs?: number } = {}) {
  const days = opts.days ?? 60;
  const limit = opts.limit ?? 80;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { FotmobProvider } = await import("./providers/fotmob.server");
  const fotmob = new FotmobProvider();

  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data: done } = await supabaseAdmin
    .from("team_match_stats")
    .select("match_id")
    .eq("payload->>shots", "true")
    .gte("created_at", new Date(Date.now() - 400 * 86400_000).toISOString())
    .limit(20000);
  const have = new Set((done ?? []).map((r) => r.match_id));

  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("id, kickoff_at, home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)")
    .eq("status", "FINISHED")
    .gte("kickoff_at", since)
    .order("kickoff_at", { ascending: false })
    .limit(2000);

  const todo = (matches ?? []).filter((m) => !have.has(m.id)).slice(0, limit);
  let imported = 0;
  let missing = 0;
  const deadline = Date.now() + (opts.budgetMs ?? 75_000);
  let skipped = 0;
  let playersSaved = 0;
  for (const m of todo) {
    if (Date.now() > deadline) { skipped++; continue; }
    try {
      const home = (m as unknown as { home: { name: string } | null }).home?.name ?? "";
      const away = (m as unknown as { away: { name: string } | null }).away?.name ?? "";
      const { data: src } = await supabaseAdmin
        .from("match_sources")
        .select("provider_match_id")
        .eq("match_id", m.id)
        .eq("source_id", "fotmob")
        .maybeSingle();
      let pid = src?.provider_match_id ?? null;
      if (!pid) {
        pid = await fotmob.findMatchId(m.kickoff_at, home, away);
        if (pid) {
          await supabaseAdmin
            .from("match_sources")
            .upsert({ match_id: m.id, source_id: "fotmob", provider_match_id: pid }, { onConflict: "source_id,provider_match_id", ignoreDuplicates: true });
        }
      }
      if (!pid) {
        missing += 1;
        continue;
      }
      const res = await fotmob.getMatchFacts(pid);
      const box = res.ok ? parseBoxScore(res.data) : null;
      if (!box) {
        missing += 1;
        continue;
      }
      await supabaseAdmin.from("team_match_stats").upsert(
        [
          { match_id: m.id, team_id: m.home_team_id, is_home: true, ...box.home, payload: { source: "fotmob", players: true, shots: true } },
          { match_id: m.id, team_id: m.away_team_id, is_home: false, ...box.away, payload: { source: "fotmob", players: true, shots: true } },
        ],
        { onConflict: "match_id,team_id" },
      );
      const xg = res.ok ? parseXg(res.data) : null;
      if (xg) await saveXg(supabaseAdmin, m, xg);
      if (res.ok) playersSaved += await savePlayerStats(supabaseAdmin, m, res.data);
      if (res.ok) await saveShots(supabaseAdmin, m, res.data);
      imported += 1;
      await new Promise((r) => setTimeout(r, 120));
    } catch {
      missing += 1;
    }
  }
  return { candidates: todo.length, imported, missing, skipped, playersSaved, triggeredBy: opts.triggeredBy ?? "manual" };
}

/** Per-player match lines from FotMob, linked only to players we already know by FotMob id. */
async function savePlayerStats(
  db: any,
  m: { id: string; home_team_id: string; away_team_id: string },
  facts: import("./providers/fotmob.server").MatchFacts,
): Promise<number> {
  const rows = (facts.playerRatings ?? []).filter((p) => p.playerId);
  if (!rows.length) return 0;
  const { data: known } = await db
    .from("players").select("id, provider_ids")
    .in("provider_ids->>fotmob", rows.map((r) => r.playerId));
  const byFm = new Map<string, string>();
  for (const k of known ?? []) byFm.set(String((k.provider_ids ?? {}).fotmob), k.id);
  const cards = new Map<string, { y: number; r: number }>();
  for (const e of facts.events ?? []) {
    if (!/card/i.test(e.type) || !e.player) continue;
    const c = cards.get(e.player) ?? { y: 0, r: 0 };
    if (/red/i.test(e.detail ?? "")) c.r++; else c.y++;
    cards.set(e.player, c);
  }
  const out = rows.flatMap((p) => {
    const pid = byFm.get(String(p.playerId));
    if (!pid) return [];
    const c = cards.get(p.name) ?? { y: 0, r: 0 };
    return [{
      match_id: m.id, player_id: pid, team_id: p.side === "home" ? m.home_team_id : m.away_team_id,
      minutes: p.minutes ?? 0, goals: p.goals ?? 0, assists: p.assists ?? 0,
      yellow_cards: Math.min(c.y, 2), red_cards: Math.min(c.r, 1), rating: p.rating,
      payload: { source: "fotmob", xg: p.xg },
    }];
  });
  if (!out.length) return 0;
  await db.from("player_match_stats").upsert(out, { onConflict: "match_id,player_id" });
  return out.length;
}

async function saveShots(
  db: any,
  m: { id: string; home_team_id: string; away_team_id: string },
  facts: import("./providers/fotmob.server").MatchFacts,
) {
  const shots = (facts.shots ?? []).filter((s) => !s.ownGoal);
  if (!shots.length) return;
  const fm = [...new Set(shots.map((s) => s.playerId).filter(Boolean))] as string[];
  const { data: known } = fm.length ? await db.from("players").select("id, provider_ids").in("provider_ids->>fotmob", fm) : { data: [] };
  const byFm = new Map<string, string>((known ?? []).map((k: any) => [String(k.provider_ids?.fotmob), k.id]));
  const { scoreShot, loadShotModel } = await import("./shot-xg.server");
  const model = await loadShotModel(db);
  await db.from("match_shots").delete().eq("match_id", m.id);
  await db.from("match_shots").insert(shots.map((s) => ({
    match_id: m.id, team_id: s.side === "home" ? m.home_team_id : m.away_team_id,
    player_id: s.playerId ? byFm.get(s.playerId) ?? null : null, player_name: s.player,
    minute: s.minute, x: s.x, y: s.y, situation: s.situation, shot_type: s.shotType,
    outcome: s.outcome, is_goal: s.outcome === "Goal", on_target: s.onTarget, provider_xg: s.xg,
    model_xg: model ? scoreShot(model, { x: s.x, y: s.y, situation: s.situation ?? null, shot_type: s.shotType ?? null }) : null,
  })));
}
