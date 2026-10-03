/** Builds the per-match picks from every stored signal (server only). */
import { scoreMatch, type H2H, type TeamExtras, type TeamForm } from "@/lib/models/match-picks";

type Past = { home_team_id: string; away_team_id: string; home_score: number; away_score: number; kickoff_at: string };

/** One best pick (or "no bet") for every fixture in the next 36 hours. */
export async function computeMatchPicks() {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const end = new Date(now.getTime() + 36 * 3600e3);

  const { data: fixtures } = await sb
    .from("matches")
    .select("id, kickoff_at, home_team_id, away_team_id, league:leagues(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)")
    .eq("status", "SCHEDULED")
    .gte("kickoff_at", now.toISOString())
    .lte("kickoff_at", end.toISOString())
    .order("kickoff_at")
    .limit(80);
  const rows = (fixtures ?? []) as unknown as Array<{
    id: string; kickoff_at: string; home_team_id: string; away_team_id: string;
    league: { name: string } | null; home: { name: string } | null; away: { name: string } | null;
  }>;
  if (!rows.length) return { picks: [], noBets: [], track: [], summary: null, generatedAt: now.toISOString() };

  const ids = rows.map((r) => r.id);
  const teamIds = [...new Set(rows.flatMap((r) => [r.home_team_id, r.away_team_id]))];
  const teamList = teamIds.join(",");
  const since = new Date(now.getTime() - 400 * 86400e3).toISOString();

  const [preds, lineups, past, injuries, conditions, spells, settled] = await Promise.all([
    sb.from("predictions").select("match_id, lambda_home, lambda_away, prediction_timestamp").in("match_id", ids).order("prediction_timestamp", { ascending: false }),
    sb.from("lineups").select("match_id, is_predicted").in("match_id", ids),
    sb.from("matches").select("id, home_team_id, away_team_id, home_score, away_score, kickoff_at")
      .eq("status", "FINISHED").gte("kickoff_at", since)
      .or(`home_team_id.in.(${teamList}),away_team_id.in.(${teamList})`)
      .order("kickoff_at", { ascending: false }).limit(5000),
    sb.from("injuries").select("team_id").in("team_id", teamIds).is("resolved_at", null),
    sb.from("player_conditions").select("team_id, sharpness, load_index").in("team_id", teamIds),
    sb.from("coach_spells").select("team_id, coach_id, coach:coaches(name)").in("team_id", teamIds).eq("is_current", true),
    sb.from("ai_bet_log").select("pick_code, probability, result, slip_type").in("result", ["hit", "miss"])
      .gte("kickoff_at", new Date(now.getTime() - 70 * 86400e3).toISOString()).limit(5000),
  ]);

  const lambdas = new Map<string, { lh: number; la: number }>();
  for (const p of preds.data ?? []) if (!lambdas.has(p.match_id)) lambdas.set(p.match_id, { lh: Number(p.lambda_home), la: Number(p.lambda_away) });
  const lineupStatus = new Map<string, "confirmed" | "projected">();
  for (const l of lineups.data ?? []) {
    if (!l.is_predicted) lineupStatus.set(l.match_id, "confirmed");
    else if (!lineupStatus.has(l.match_id)) lineupStatus.set(l.match_id, "projected");
  }

  // ---- form + rest days -------------------------------------------------------
  const pastRows: Past[] = ((past.data ?? []) as Past[]).filter((p) => p.home_score !== null && p.away_score !== null);

  // ---- long history (football-data.co.uk) for form, H2H, corners and cards --
  const histSince = new Date(now.getTime() - 3 * 365 * 86400e3).toISOString().slice(0, 10);
  const { data: hist } = await sb.from("historical_results")
    .select("match_date, home_team_id, away_team_id, home_goals, away_goals, home_corners, away_corners, home_yellow, away_yellow, home_red, away_red")
    .or(`home_team_id.in.(${teamList}),away_team_id.in.(${teamList})`)
    .gte("match_date", histSince).order("match_date", { ascending: false }).limit(8000);
  const seen = new Set(pastRows.map((p) => `${p.kickoff_at.slice(0, 10)}|${p.home_team_id}|${p.away_team_id}`));
  type SetPiece = { cf: number | null; ca: number | null; cards: number | null };
  const setPieces = new Map<string, SetPiece[]>();
  for (const h of hist ?? []) {
    for (const [tid, cf, ca] of [[h.home_team_id, h.home_corners, h.away_corners], [h.away_team_id, h.away_corners, h.home_corners]] as const) {
      if (!tid || !teamIds.includes(tid)) continue;
      const l = setPieces.get(tid) ?? [];
      if (l.length < 12) {
        const cards = h.home_yellow === null || h.away_yellow === null ? null
          : h.home_yellow + h.away_yellow + (h.home_red ?? 0) + (h.away_red ?? 0);
        l.push({ cf, ca, cards });
        setPieces.set(tid, l);
      }
    }
    if (!h.home_team_id || !h.away_team_id) continue;
    const key = `${h.match_date}|${h.home_team_id}|${h.away_team_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pastRows.push({ home_team_id: h.home_team_id, away_team_id: h.away_team_id, home_score: h.home_goals, away_score: h.away_goals, kickoff_at: `${h.match_date}T15:00:00Z` });
  }
  pastRows.sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at));

  // ---- Elo ratings (club + national) ----------------------------------------
  const { data: elos } = await sb.from("elo_ratings").select("team_id, rating").in("team_id", teamIds);
  const eloBy = new Map<string, number>();
  for (const e of elos ?? []) if (e.team_id) eloBy.set(e.team_id, Number(e.rating));

  // ---- referee cards per game ------------------------------------------------
  const { data: offs } = await sb.from("match_officials").select("match_id, referee_id").in("match_id", ids).eq("role", "referee");
  const refIds = [...new Set((offs ?? []).map((o) => o.referee_id))];
  const { data: refStats } = refIds.length
    ? await sb.from("referee_stats").select("referee_id, yellow_per_game, red_per_game, matches").in("referee_id", refIds)
    : { data: [] as Array<{ referee_id: string; yellow_per_game: number | null; red_per_game: number | null; matches: number }> };
  const refAvgBy = new Map<string, number>();
  for (const r of refStats ?? []) if (r.yellow_per_game !== null && r.matches >= 5) refAvgBy.set(r.referee_id, Number(r.yellow_per_game) + Number(r.red_per_game ?? 0));
  const refByMatch = new Map<string, number>();
  for (const o of offs ?? []) { const v = refAvgBy.get(o.referee_id); if (v !== undefined) refByMatch.set(o.match_id, v); }

  const setPieceInputs = (h: string, a: string, matchId: string) => {
    const hl = setPieces.get(h) ?? [], al = setPieces.get(a) ?? [];
    const cor = (l: SetPiece[]) => l.filter((x) => x.cf !== null && x.ca !== null) as Array<{ cf: number; ca: number; cards: number | null }>;
    const hc = cor(hl), ac = cor(al);
    const m = (l: number[]) => l.reduce((x, y) => x + y, 0) / l.length;
    const corners = hc.length >= 5 && ac.length >= 5 ? {
      expected: (m(hc.map((x) => x.cf)) + m(ac.map((x) => x.ca))) / 2 + (m(ac.map((x) => x.cf)) + m(hc.map((x) => x.ca))) / 2,
      overShare: [...hc, ...ac].filter((x) => x.cf + x.ca > 9.5).length / (hc.length + ac.length),
      samples: Math.min(hc.length, ac.length),
    } : null;
    const hk = hl.map((x) => x.cards).filter((x): x is number => x !== null);
    const ak = al.map((x) => x.cards).filter((x): x is number => x !== null);
    const cards = hk.length >= 5 && ak.length >= 5 ? {
      expected: (m(hk) + m(ak)) / 2,
      overShare: [...hk, ...ak].filter((x) => x > 4.5).length / (hk.length + ak.length),
      samples: Math.min(hk.length, ak.length),
      refereeAvg: refByMatch.get(matchId) ?? null,
    } : null;
    return { corners, cards };
  };
  const perTeam = new Map<string, Array<{ gf: number; ga: number }>>();
  const lastPlayed = new Map<string, string>();
  for (const p of pastRows) {
    for (const [tid, gf, ga] of [[p.home_team_id, p.home_score, p.away_score], [p.away_team_id, p.away_score, p.home_score]] as const) {
      if (!teamIds.includes(tid)) continue;
      if (!lastPlayed.has(tid)) lastPlayed.set(tid, p.kickoff_at);
      const list = perTeam.get(tid) ?? [];
      if (list.length < 12) { list.push({ gf, ga }); perTeam.set(tid, list); }
    }
  }
  const formOf = (tid: string): TeamForm | null => {
    const l = perTeam.get(tid);
    if (!l?.length) return null;
    const n = l.length;
    const r = (fn: (g: { gf: number; ga: number }) => boolean) => l.filter(fn).length / n;
    return {
      matches: n,
      gf: l.reduce((a, g) => a + g.gf, 0) / n,
      ga: l.reduce((a, g) => a + g.ga, 0) / n,
      winRate: r((g) => g.gf > g.ga), drawRate: r((g) => g.gf === g.ga), lossRate: r((g) => g.gf < g.ga),
      over15: r((g) => g.gf + g.ga > 1), over25: r((g) => g.gf + g.ga > 2), over35: r((g) => g.gf + g.ga > 3),
      btts: r((g) => g.gf > 0 && g.ga > 0), scored: r((g) => g.gf > 0),
      last5: l.slice(0, 5).map((g) => (g.gf > g.ga ? "W" : g.gf === g.ga ? "D" : "L")).join(""),
    };
  };

  // ---- real box-score averages (last 10 imported games) ----------------------
  const { data: stats } = await sb.from("team_match_stats").select("team_id, shots_on_target, corners, created_at")
    .in("team_id", teamIds).order("created_at", { ascending: false }).limit(3000);
  const sotBy = new Map<string, number[]>();
  for (const s of stats ?? []) {
    if (s.shots_on_target === null) continue;
    const l = sotBy.get(s.team_id) ?? [];
    if (l.length < 10) { l.push(s.shots_on_target); sotBy.set(s.team_id, l); }
  }
  const { data: xgRows } = await sb.from("team_xg").select("team_id, xg, xg_against, created_at")
    .in("team_id", teamIds).order("created_at", { ascending: false }).limit(3000);
  const { data: mvRows } = await sb.from("market_values").select("team_id, squad_value_eur, fetched_at")
    .in("team_id", teamIds).order("fetched_at", { ascending: false }).limit(2000);
  const mvBy = new Map<string, number>();
  for (const r of mvRows ?? []) if (r.squad_value_eur && !mvBy.has(r.team_id)) mvBy.set(r.team_id, Number(r.squad_value_eur));
  const xgBy = new Map<string, { f: number[]; a: number[] }>();
  for (const r of xgRows ?? []) {
    if (r.xg === null || r.xg_against === null) continue;
    const e = xgBy.get(r.team_id) ?? { f: [], a: [] };
    if (e.f.length < 10) { e.f.push(Number(r.xg)); e.a.push(Number(r.xg_against)); xgBy.set(r.team_id, e); }
  }

  const injBy = new Map<string, number>();
  for (const i of injuries.data ?? []) if (i.team_id) injBy.set(i.team_id, (injBy.get(i.team_id) ?? 0) + 1);
  const condBy = new Map<string, { s: number[]; l: number[] }>();
  for (const c of conditions.data ?? []) {
    if (!c.team_id) continue;
    const e = condBy.get(c.team_id) ?? { s: [], l: [] };
    if (c.sharpness !== null) e.s.push(Number(c.sharpness));
    if (c.load_index !== null) e.l.push(Number(c.load_index));
    condBy.set(c.team_id, e);
  }
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  const coachIds = [...new Set((spells.data ?? []).map((s) => s.coach_id))];
  const { data: profiles } = coachIds.length
    ? await sb.from("coach_profiles").select("coach_id, seasons").in("coach_id", coachIds)
    : { data: [] as Array<{ coach_id: string; seasons: unknown }> };
  const coachRate = new Map<string, number>();
  for (const p of profiles ?? []) {
    const list = Array.isArray(p.seasons) ? (p.seasons as Array<{ matches?: number; wins?: number }>) : [];
    const m = list.reduce((a, r) => a + (r.matches ?? 0), 0);
    const w = list.reduce((a, r) => a + (r.wins ?? 0), 0);
    if (m >= 20) coachRate.set(p.coach_id, w / m);
  }
  const coachBy = new Map<string, { rate: number | null; name: string | null }>();
  for (const s of spells.data ?? []) {
    coachBy.set(s.team_id, { rate: coachRate.get(s.coach_id) ?? null, name: (s.coach as { name?: string } | null)?.name ?? null });
  }

  const extras = (tid: string, kickoff: string): TeamExtras => {
    const c = condBy.get(tid);
    const last = lastPlayed.get(tid);
    const sharp = c ? mean(c.s) : null;
    const load = c ? mean(c.l) : null;
    return {
      shotsOnTarget: mean(sotBy.get(tid) ?? []),
      squadValue: mvBy.get(tid) ?? null,
      xgFor: (xgBy.get(tid)?.f.length ?? 0) >= 3 ? mean(xgBy.get(tid)!.f) : null,
      xgAgainst: (xgBy.get(tid)?.a.length ?? 0) >= 3 ? mean(xgBy.get(tid)!.a) : null,
      corners: null,
      injuries: injBy.get(tid) ?? 0,
      avgSharpness: sharp === null ? null : sharp > 1 ? sharp / 100 : sharp,
      avgLoad: load === null ? null : load > 1 ? load / 100 : load,
      restDays: last ? Math.round((new Date(kickoff).getTime() - new Date(last).getTime()) / 86400e3) : null,
      coachWinRate: coachBy.get(tid)?.rate ?? null,
      coachName: coachBy.get(tid)?.name ?? null,
    };
  };

  const h2hOf = (h: string, a: string): H2H | null => {
    const games = pastRows.filter((p) => (p.home_team_id === h && p.away_team_id === a) || (p.home_team_id === a && p.away_team_id === h)).slice(0, 8);
    if (!games.length) return null;
    let hw = 0, d = 0, aw = 0, o = 0, b = 0;
    for (const g of games) {
      const hg = g.home_team_id === h ? g.home_score : g.away_score;
      const ag = g.home_team_id === h ? g.away_score : g.home_score;
      if (hg > ag) hw++; else if (hg === ag) d++; else aw++;
      if (hg + ag > 2) o++;
      if (hg > 0 && ag > 0) b++;
    }
    return { matches: games.length, homeWins: hw, draws: d, awayWins: aw, over25: o / games.length, btts: b / games.length };
  };

  // ---- self-review calibration from settled picks ---------------------------
  const calAgg = new Map<string, { n: number; hit: number; exp: number }>();
  for (const s of settled.data ?? []) {
    const e = calAgg.get(s.pick_code) ?? { n: 0, hit: 0, exp: 0 };
    e.n++; e.exp += Number(s.probability); if (s.result === "hit") e.hit++;
    calAgg.set(s.pick_code, e);
  }
  const calibration: Record<string, number> = {};
  for (const [code, e] of calAgg) {
    if (e.n < 8) continue;
    const ratio = e.hit / e.exp;
    const w = e.n / (e.n + 30); // shrink toward 1
    calibration[code] = 1 + (ratio - 1) * w;
  }
  const track = [...calAgg.entries()]
    .filter(([, e]) => e.n >= 5)
    .map(([code, e]) => ({ code, picks: e.n, hitRate: e.hit / e.n, expected: e.exp / e.n }))
    .sort((a, b) => b.picks - a.picks);

  // ---- latest model-competition winner (walk-forward best on league history) ----
  const { data: comp } = await sb.from("model_competitions").select("winner, ratings")
    .order("run_at", { ascending: false }).limit(1).maybeSingle();
  const { championProbs } = await import("./model-competition.server");
  const compRatings = (comp?.ratings ?? {}) as Record<string, Parameters<typeof championProbs>[1] & object>;

  const picks = [];
  const noBets = [];
  for (const r of rows) {
    const homeName = r.home?.name ?? "Home";
    const awayName = r.away?.name ?? "Away";
    const lam = lambdas.get(r.id);
    const cp = comp?.winner && comp.winner !== "baseline"
      ? championProbs(comp.winner, compRatings[r.home_team_id], compRatings[r.away_team_id]) : null;
    const result = scoreMatch({
      homeName, awayName,
      lambdaHome: lam?.lh ?? null, lambdaAway: lam?.la ?? null,
      lineupStatus: lineupStatus.get(r.id) ?? "none",
      homeForm: formOf(r.home_team_id), awayForm: formOf(r.away_team_id),
      home: extras(r.home_team_id, r.kickoff_at), away: extras(r.away_team_id, r.kickoff_at),
      h2h: h2hOf(r.home_team_id, r.away_team_id),
      calibration,
      elo: eloBy.has(r.home_team_id) && eloBy.has(r.away_team_id) ? { home: eloBy.get(r.home_team_id)!, away: eloBy.get(r.away_team_id)!, neutral: false } : null,
      champion: cp ? { name: comp!.winner!, ...cp } : null,
      ...setPieceInputs(r.home_team_id, r.away_team_id, r.id),
    });
    const base = { matchId: r.id, fixture: `${homeName} vs ${awayName}`, league: r.league?.name ?? null, kickoffAt: r.kickoff_at };
    if (result.pick) picks.push({ ...base, ...result.pick, confidence: result.confidence!, reasons: result.reasons });
    else noBets.push({ ...base, reason: result.noBetReason ?? "No clear edge." });
  }
  picks.sort((a, b) => b.probability - a.probability);

  // Save today's picks for automatic grading (idempotent).
  try {
    const { logDailyPicks } = await import("@/lib/bet-log.server");
    await logDailyPicks(picks.map((p) => ({
      matchId: p.matchId, fixture: p.fixture, league: p.league, kickoffAt: p.kickoffAt,
      slipType: "match_pick", market: p.market, pickCode: p.code, selection: p.selection,
      probability: Number(p.probability.toFixed(4)), fairOdds: Number((1 / p.probability).toFixed(2)),
      facts: p.reasons, opinion: null,
    })));
  } catch {
    // logging is best-effort
  }

  const { data: history } = await sb.from("ai_bet_log").select("result, probability").eq("slip_type", "match_pick").in("result", ["hit", "miss"]).limit(5000);
  const settledPicks = history ?? [];
  const summary = settledPicks.length
    ? { picks: settledPicks.length, hits: settledPicks.filter((h) => h.result === "hit").length, expected: settledPicks.reduce((a, h) => a + Number(h.probability), 0) / settledPicks.length }
    : null;

  return { picks, noBets, track, summary, generatedAt: now.toISOString() };
}

/** Computes picks and stores them for instant page loads. */
export async function refreshMatchPicks() {
  const result = await computeMatchPicks();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("match_picks_cache").upsert({
    id: "latest",
    payload: JSON.parse(JSON.stringify(result)),
    computed_at: new Date().toISOString(),
  });
  return result;
}
