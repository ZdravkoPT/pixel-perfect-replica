import { computePlayerForm } from "./models/player-form";
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
    .select("id, kickoff_at, home_team_id, away_team_id, league_id, season_id, league:leagues(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)")
    .eq("status", "SCHEDULED")
    .gte("kickoff_at", now.toISOString())
    .lte("kickoff_at", end.toISOString())
    .order("kickoff_at")
    .limit(80);
  const rows = (fixtures ?? []) as unknown as Array<{
    id: string; kickoff_at: string; home_team_id: string; away_team_id: string; league_id: string | null; season_id: string | null;
    league: { name: string } | null; home: { name: string } | null; away: { name: string } | null;
  }>;
  if (!rows.length) return { picks: [], noBets: [], track: [], signalTrack: [], reasonTrack: [], summary: null, generatedAt: now.toISOString() };

  const ids = rows.map((r) => r.id);
  const teamIds = [...new Set(rows.flatMap((r) => [r.home_team_id, r.away_team_id]))];
  const teamList = teamIds.join(",");
  const since = new Date(now.getTime() - 400 * 86400e3).toISOString();

  const [preds, lineups, past, injuries, conditions, spells, settled] = await Promise.all([
    sb.from("predictions").select("match_id, lambda_home, lambda_away, prediction_timestamp").in("match_id", ids).order("prediction_timestamp", { ascending: false }),
    sb.from("lineups").select("match_id, team_id, is_predicted, lineup_players(player_id, is_starter, player:players(name))").in("match_id", ids),
    sb.from("matches").select("id, home_team_id, away_team_id, home_score, away_score, kickoff_at")
      .eq("status", "FINISHED").gte("kickoff_at", since)
      .or(`home_team_id.in.(${teamList}),away_team_id.in.(${teamList})`)
      .order("kickoff_at", { ascending: false }).limit(5000),
    sb.from("injuries").select("team_id, player_id, player:players(name)").in("team_id", teamIds).is("resolved_at", null),
    sb.from("player_conditions").select("player_id, team_id, sharpness, load_index, minutes_share").in("team_id", teamIds),
    sb.from("coach_spells").select("team_id, coach_id, coach:coaches(name)").in("team_id", teamIds).eq("is_current", true),
    sb.from("ai_bet_log").select("pick_code, probability, result, slip_type, signals, facts, kickoff_at").in("result", ["hit", "miss"])
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
  // ---- goalkeeper (goals prevented vs our xG) + set-piece xG, last 10 games with shot maps ----
  const SP = new Set(["FromCorner", "FreeKick", "SetPiece", "ThrowInSetPiece"]);
  const gkBy = new Map<string, number>();
  const spBy = new Map<string, { f: number; a: number }>();
  {
    const pm = (past.data ?? []) as Array<{ id: string; home_team_id: string; away_team_id: string; kickoff_at: string }>;
    const shots: Array<{ match_id: string; team_id: string | null; model_xg: number | null; is_goal: boolean; on_target: boolean; situation: string | null }> = [];
    const mids = pm.map((m) => m.id);
    for (let i = 0; i < mids.length; i += 200) {
      const { data } = await sb.from("match_shots").select("match_id, team_id, model_xg, is_goal, on_target, situation").in("match_id", mids.slice(i, i + 200)).limit(20000);
      shots.push(...((data ?? []) as typeof shots));
    }
    const byMatch = new Map<string, typeof shots>();
    for (const s of shots) { const a = byMatch.get(s.match_id) ?? []; a.push(s); byMatch.set(s.match_id, a); }
    for (const tid of teamIds) {
      const games = pm.filter((m) => (m.home_team_id === tid || m.away_team_id === tid) && byMatch.has(m.id)).slice(0, 10);
      if (games.length < 5) continue;
      let prevented = 0, spF = 0, spA = 0;
      for (const g of games) {
        for (const s of byMatch.get(g.id)!) {
          if (s.model_xg == null || !s.team_id) continue;
          const xg = Number(s.model_xg);
          if (s.team_id === tid) { if (s.situation && SP.has(s.situation)) spF += xg; continue; }
          if (s.situation && SP.has(s.situation)) spA += xg;
          if (s.on_target && s.situation !== "Penalty") prevented += xg - (s.is_goal ? 1 : 0);
        }
      }
      gkBy.set(tid, Number((prevented / games.length).toFixed(2)));
      spBy.set(tid, { f: Number((spF / games.length).toFixed(2)), a: Number((spA / games.length).toFixed(2)) });
    }
  }
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
  // player importance: minutes share of each unavailable player
  const shareBy = new Map<string, number>();
  const condTeams = new Set<string>();
  for (const c of conditions.data ?? []) {
    if (c.team_id) condTeams.add(c.team_id);
    if (c.minutes_share !== null) { const v = Number(c.minutes_share); shareBy.set(c.player_id, v > 1.5 ? v / 100 : Math.min(v, 1)); }
  }
  const missBy = new Map<string, { share: number; keys: string[] }>();
  const seenInj = new Set<string>();
  for (const i of (injuries.data ?? []) as Array<{ team_id: string | null; player_id: string; player: { name?: string } | null }>) {
    if (!i.team_id || seenInj.has(i.player_id)) continue;
    seenInj.add(i.player_id);
    const e = missBy.get(i.team_id) ?? { share: 0, keys: [] };
    const sh = shareBy.get(i.player_id) ?? 0;
    e.share += sh;
    if (sh >= 0.5 && i.player?.name) e.keys.push(i.player.name);
    missBy.set(i.team_id, e);
  }
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  // ---- key regulars' form score (same formula as player pages) ---------------
  // ---- starting XI vs usual XI (minutes share of who actually starts) -------
  const teamShares = new Map<string, Array<{ id: string; sh: number }>>();
  for (const c of conditions.data ?? []) {
    if (!c.team_id) continue;
    const a = teamShares.get(c.team_id) ?? []; a.push({ id: c.player_id, sh: shareBy.get(c.player_id) ?? 0 }); teamShares.set(c.team_id, a);
  }
  const xiBy = new Map<string, { ratio: number; benched: string[] }>();
  type LP = { player_id: string; is_starter: boolean; player: { name?: string } | null };
  const bestLineup = new Map<string, { is_predicted: boolean; players: LP[] }>();
  for (const l of (lineups.data ?? []) as Array<{ match_id: string; team_id: string; is_predicted: boolean; lineup_players: LP[] | null }>) {
    const k = `${l.match_id}|${l.team_id}`; const cur = bestLineup.get(k);
    if (!cur || (cur.is_predicted && !l.is_predicted)) bestLineup.set(k, { is_predicted: l.is_predicted, players: l.lineup_players ?? [] });
  }
  for (const [k, l] of bestLineup) {
    const tid = k.split("|")[1]!;
    const squad = (teamShares.get(tid) ?? []).filter((x) => x.sh > 0).sort((a, b) => b.sh - a.sh);
    const starters = l.players.filter((p) => p.is_starter);
    if (squad.length < 11 || starters.length < 10) continue; // not enough evidence
    const usual = squad.slice(0, 11).reduce((a, x) => a + x.sh, 0);
    const startIds = new Set(starters.map((p) => p.player_id));
    const actual = starters.reduce((a, p) => a + (shareBy.get(p.player_id) ?? 0), 0);
    if (usual <= 0) continue;
    const benchedIds = squad.slice(0, 11).filter((x) => x.sh >= 0.5 && !startIds.has(x.id) && !seenInj.has(x.id)).map((x) => x.id);
    const names = new Map(l.players.map((p) => [p.player_id, p.player?.name]));
    xiBy.set(k, { ratio: Math.min(1, actual / usual), benched: benchedIds.map((id) => names.get(id)).filter((n): n is string => !!n) });
  }

  const keyPlayers = (conditions.data ?? []).filter((c) => c.team_id && !seenInj.has(c.player_id) && (shareBy.get(c.player_id) ?? 0) >= 0.5);
  const keyIds = [...new Set(keyPlayers.map((c) => c.player_id))];
  const formBy = new Map<string, { hot: string[]; cold: string[] }>();
  if (keyIds.length) {
    const statRows: Array<{ player_id: string; match_id: string; minutes: number; rating: number | null; goals: number; assists: number; shots: number; created_at: string; player: { name?: string } | null }> = [];
    for (let i = 0; i < keyIds.length; i += 150) {
      const { data } = await sb.from("player_match_stats")
        .select("player_id, match_id, minutes, rating, goals, assists, shots, created_at, player:players(name)")
        .in("player_id", keyIds.slice(i, i + 150)).gt("minutes", 0)
        .order("created_at", { ascending: false }).limit(3000);
      statRows.push(...((data ?? []) as typeof statRows));
    }
    const shotXg = new Map<string, number>();
    const matchIds = [...new Set(statRows.map((s) => s.match_id))];
    for (let i = 0; i < matchIds.length; i += 200) {
      const { data } = await sb.from("match_shots").select("match_id, player_id, model_xg")
        .in("match_id", matchIds.slice(i, i + 200)).in("player_id", keyIds).not("model_xg", "is", null);
      for (const s of data ?? []) { const k = `${s.match_id}|${s.player_id}`; shotXg.set(k, (shotXg.get(k) ?? 0) + Number(s.model_xg)); }
    }
    const byPlayer = new Map<string, typeof statRows>();
    for (const s of statRows) { const a = byPlayer.get(s.player_id) ?? []; a.push(s); byPlayer.set(s.player_id, a); }
    for (const c of keyPlayers) {
      const games = byPlayer.get(c.player_id);
      if (!games) continue;
      const f = computePlayerForm(games.slice(0, 5).map((g) => ({
        minutes: g.minutes, rating: g.rating === null ? null : Number(g.rating), goals: g.goals, assists: g.assists, shots: g.shots,
        xg: shotXg.get(`${g.match_id}|${g.player_id}`) ?? null,
      })));
      const name = games[0]?.player?.name;
      if (!f || !name) continue;
      const e = formBy.get(c.team_id!) ?? { hot: [], cold: [] };
      if (f.score >= 75) e.hot.push(`${name} ${Math.round(f.score)}`);
      else if (f.score < 40) e.cold.push(`${name} ${Math.round(f.score)}`);
      formBy.set(c.team_id!, e);
    }
  }

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

  // ---- formation change: last 3 confirmed formations vs the 5 before them ----
  const shapeBy = new Map<string, { from: string; to: string }>();
  {
    const { data: fl } = await sb.from("lineups").select("team_id, formation, match:matches!inner(kickoff_at, status)")
      .in("team_id", teamIds).eq("is_predicted", false).not("formation", "is", null)
      .eq("match.status", "FINISHED").limit(5000);
    const byTeam = new Map<string, Array<{ f: string; t: string }>>();
    for (const l of (fl ?? []) as Array<{ team_id: string; formation: string; match: { kickoff_at: string } | null }>) {
      if (!l.match) continue;
      const a = byTeam.get(l.team_id) ?? []; a.push({ f: l.formation, t: l.match.kickoff_at }); byTeam.set(l.team_id, a);
    }
    for (const [tid, a] of byTeam) {
      a.sort((x, y) => y.t.localeCompare(x.t));
      if (a.length < 6) continue; // need a real "usual" shape
      const before = a.slice(3, 8);
      const counts = new Map<string, number>();
      for (const x of before) counts.set(x.f, (counts.get(x.f) ?? 0) + 1);
      const [usual, n] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]!;
      if (n < Math.ceil(before.length * 0.6)) continue; // no settled shape before
      const recent = a.slice(0, 3).map((x) => x.f);
      const changed = recent.find((f) => f !== usual);
      if (changed && recent.filter((f) => f !== usual).length >= 1 && recent[0] !== usual) shapeBy.set(tid, { from: usual, to: recent[0]! });
    }
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
      missingShare: condTeams.has(tid) ? Number((missBy.get(tid)?.share ?? 0).toFixed(2)) : null,
      keyAbsent: missBy.get(tid)?.keys ?? [],
      keyForm: formBy.get(tid) ?? null,
      keeperPrevented: gkBy.get(tid) ?? null,
      setPiece: spBy.get(tid) ?? null,
      shapeChange: shapeBy.get(tid) ?? null,
      games14: pastRows.length ? pastRows.filter((p) => (p.home_team_id === tid || p.away_team_id === tid)
        && new Date(p.kickoff_at).getTime() < new Date(kickoff).getTime()
        && new Date(kickoff).getTime() - new Date(p.kickoff_at).getTime() <= 14 * 86400e3).length : null,
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

  // ---- self-correcting market floors from each market's last 60 settled picks ----
  const byCode = new Map<string, { hit: boolean; p: number }[]>();
  for (const s of [...(settled.data ?? [])].sort((a, b) => String(b.kickoff_at).localeCompare(String(a.kickoff_at)))) {
    const arr = byCode.get(s.pick_code) ?? [];
    if (arr.length < 60) arr.push({ hit: s.result === "hit", p: Number(s.probability) });
    byCode.set(s.pick_code, arr);
  }
  const marketFloors: Record<string, number> = {};
  for (const [code, a] of byCode) {
    if (a.length < 20) continue;
    const hit = a.filter((x) => x.hit).length / a.length;
    const exp = a.reduce((t, x) => t + x.p, 0) / a.length;
    const gap = exp - hit; // positive = market underdelivers
    let floor = 0.62;
    if (gap > 0.03) floor = 0.62 + gap * (a.length / (a.length + 20));
    else if (gap < -0.05 && a.length >= 40) floor = 0.6;
    marketFloors[code] = Math.min(0.75, Math.max(0.6, Math.round(floor * 100) / 100));
  }
  const weakMarkets = Object.entries(marketFloors).filter(([, f]) => f >= 0.7).map(([c]) => c);

  // ---- per-source report: how often each source was right when it backed a settled pick ----
  const srcAgg = new Map<string, { n: number; right: number; exp: number }>();
  for (const s of settled.data ?? []) {
    const list = (s as { signals?: unknown }).signals;
    if (!Array.isArray(list)) continue;
    for (const it of list as Array<{ name: string; p: number }>) {
      if (typeof it?.name !== "string" || typeof it.p !== "number") continue;
      const e = srcAgg.get(it.name) ?? { n: 0, right: 0, exp: 0 };
      const backed = it.p >= 0.5;
      e.n++;
      e.exp += backed ? it.p : 1 - it.p;
      if ((s.result === "hit") === backed) e.right++;
      srcAgg.set(it.name, e);
    }
  }
  const sourceWeights: Record<string, number> = {};
  const signalTrack = [...srcAgg.entries()].map(([name, e]) => {
    const ratio = e.right / Math.max(e.exp, 1e-6);
    if (e.n >= 20) sourceWeights[name] = 1 + (ratio - 1) * (e.n / (e.n + 40)) * 2;
    return { name, picks: e.n, rightRate: e.right / e.n, expected: e.exp / e.n, weight: sourceWeights[name] ?? 1 };
  }).sort((a, b) => b.picks - a.picks);

  // ---- latest model-competition winner (walk-forward best on league history) ----
  const { data: comp } = await sb.from("model_competitions").select("winner, ratings")
    .order("run_at", { ascending: false }).limit(1).maybeSingle();
  const { championProbs } = await import("./model-competition.server");
  const compRatings = (comp?.ratings ?? {}) as Record<string, Parameters<typeof championProbs>[1] & object>;

  // ---- league table built from our own finished league games this season (no data = no line) ----
  const seasonIds = [...new Set(rows.map((r) => r.season_id).filter((x): x is string => !!x))];
  const tableBy = new Map<string, Map<string, { pos: number; pts: number; played: number; size: number }>>();
  if (seasonIds.length) {
    const { data: sg } = await sb.from("matches").select("season_id, home_team_id, away_team_id, home_score, away_score")
      .in("season_id", seasonIds).eq("status", "FINISHED").not("home_score", "is", null).limit(10000);
    const agg = new Map<string, Map<string, { pts: number; gd: number; played: number }>>();
    for (const g of sg ?? []) {
      if (!g.season_id || g.home_score === null || g.away_score === null) continue;
      const t = agg.get(g.season_id) ?? new Map();
      const add = (id: string, f: number, a: number) => {
        const e = t.get(id) ?? { pts: 0, gd: 0, played: 0 };
        e.played++; e.gd += f - a; e.pts += f > a ? 3 : f === a ? 1 : 0; t.set(id, e);
      };
      add(g.home_team_id, g.home_score, g.away_score); add(g.away_team_id, g.away_score, g.home_score);
      agg.set(g.season_id, t);
    }
    for (const [sid, t] of agg) {
      if (t.size < 8) continue; // cups / tiny samples: no table
      const sorted = [...t.entries()].sort((a, b) => b[1].pts - a[1].pts || b[1].gd - a[1].gd);
      const m = new Map<string, NonNullable<TeamExtras["table"]>>();
      const ptsAt = (pos: number) => sorted[Math.min(sorted.length, Math.max(1, pos)) - 1]![1].pts;
      const n = sorted.length;
      sorted.forEach(([id, e], i) => m.set(id, {
        pos: i + 1, pts: e.pts, played: e.played, size: n,
        leaderPts: ptsAt(1), fourthPts: ptsAt(4), dropPts: ptsAt(n - 2), safePts: ptsAt(n - 3),
      }));
      tableBy.set(sid, m);
    }
  }
  const tableOf = (sid: string | null, tid: string) => {
    const e = sid ? tableBy.get(sid)?.get(tid) : undefined;
    return e && e.played >= 5 ? e : null;
  };

  const { data: ctxRows } = await sb.from("match_context").select("match_id, temp_c, precip_mm, wind_kmh, away_travel_km, venue_name").in("match_id", ids);
  const ctxBy = new Map((ctxRows ?? []).map((c) => [c.match_id, c]));

  // another competition's game within 3 days after kickoff -> likely rotation
  const cupSoon = (r: (typeof rows)[number], tid: string) => rows.some((o) => o.id !== r.id && o.league_id !== r.league_id
    && (o.home_team_id === tid || o.away_team_id === tid)
    && new Date(o.kickoff_at).getTime() > new Date(r.kickoff_at).getTime()
    && new Date(o.kickoff_at).getTime() - new Date(r.kickoff_at).getTime() <= 3 * 86400e3);

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
      home: { ...extras(r.home_team_id, r.kickoff_at), table: tableOf(r.season_id, r.home_team_id), cupSoon: cupSoon(r, r.home_team_id), xi: xiBy.get(`${r.id}|${r.home_team_id}`) ?? null },
      away: { ...extras(r.away_team_id, r.kickoff_at), table: tableOf(r.season_id, r.away_team_id), cupSoon: cupSoon(r, r.away_team_id), xi: xiBy.get(`${r.id}|${r.away_team_id}`) ?? null },
      h2h: h2hOf(r.home_team_id, r.away_team_id),
      calibration,
      sourceWeights,
      weakMarkets,
      marketFloors,
      elo: eloBy.has(r.home_team_id) && eloBy.has(r.away_team_id) ? { home: eloBy.get(r.home_team_id)!, away: eloBy.get(r.away_team_id)!, neutral: false } : null,
      champion: cp ? { name: comp!.winner!, ...cp } : null,
      context: (() => { const c = ctxBy.get(r.id); return c ? {
        rainMm: c.precip_mm === null ? null : Number(c.precip_mm), windKmh: c.wind_kmh === null ? null : Number(c.wind_kmh),
        tempC: c.temp_c === null ? null : Number(c.temp_c), awayTravelKm: c.away_travel_km === null ? null : Number(c.away_travel_km),
      } : null; })(),
      ...setPieceInputs(r.home_team_id, r.away_team_id, r.id),
    });
    const base = { matchId: r.id, fixture: `${homeName} vs ${awayName}`, league: r.league?.name ?? null, kickoffAt: r.kickoff_at };
    if (result.pick) picks.push({ ...base, ...result.pick, confidence: result.confidence!, reasons: result.reasons });
    else noBets.push({ ...base, reason: result.noBetReason ?? "No clear edge." });
  }
  // ---- reason accuracy: kinds of reasons that keep under/over-delivering shade new picks a little ----
  const reasonKind = (r: string) => (r.split(/[:(]/)[0] ?? "").trim().slice(0, 48);
  const rAgg = new Map<string, { n: number; hit: number; exp: number }>();
  for (const s of settled.data ?? []) {
    const facts = (s as { facts?: unknown }).facts;
    if (s.slip_type !== "match_pick" || !Array.isArray(facts)) continue;
    for (const k of new Set((facts as string[]).map(reasonKind).filter(Boolean))) {
      const e = rAgg.get(k) ?? { n: 0, hit: 0, exp: 0 };
      e.n++; e.exp += Number(s.probability); if (s.result === "hit") e.hit++;
      rAgg.set(k, e);
    }
  }
  const reasonFactor = new Map<string, number>();
  const reasonTrack = [...rAgg.entries()].filter(([, e]) => e.n >= 10).map(([kind, e]) => {
    const ratio = e.hit / Math.max(e.exp, 1e-6);
    if (e.n >= 30) reasonFactor.set(kind, 1 + (ratio - 1) * (e.n / (e.n + 60)));
    return { kind, picks: e.n, hitRate: e.hit / e.n, expected: e.exp / e.n, factor: reasonFactor.get(kind) ?? 1 };
  }).sort((a, b) => b.picks - a.picks);
  for (let i = picks.length - 1; i >= 0; i--) {
    const p = picks[i];
    if (!p) continue;
    const kinds = [...new Set(p.reasons.map(reasonKind))];
    let f = 1;
    const moved: string[] = [];
    for (const k of kinds) { const x = reasonFactor.get(k); if (x && Math.abs(x - 1) >= 0.01) { f *= x; moved.push(`${k} ${x > 1 ? "+" : ""}${Math.round((x - 1) * 100)}%`); } }
    f = Math.min(1.03, Math.max(0.97, f));
    if (f === 1) continue;
    const prob = Math.min(0.97, p.probability * f);
    const floor = marketFloors[p.code] ?? 0.62;
    if (prob < floor) {
      noBets.push({ matchId: p.matchId, fixture: p.fixture, league: p.league, kickoffAt: p.kickoffAt, reason: `Reasons behind ${p.selection} have under-delivered before (${moved.join(", ")}), leaving it below the ${Math.round(floor * 100)}% bar.` });
      picks.splice(i, 1);
      continue;
    }
    p.probability = prob;
    p.reasons = [...p.reasons, `Reason track record: ${moved.join(", ")} from past graded picks.`];
  }

  picks.sort((a, b) => b.probability - a.probability);

  // ---- upset radar (information only, never a pick): model gives the Elo underdog clearly more than usual ----
  const upsets: { matchId: string; fixture: string; league: string | null; kickoffAt: string; underdog: string; winChance: number; modelShare: number; usualShare: number }[] = [];
  const pois = (l: number, k: number) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return Math.exp(-l) * l ** k / f; };
  for (const r of rows) {
    const lam = lambdas.get(r.id);
    const eh = eloBy.get(r.home_team_id), ea = eloBy.get(r.away_team_id);
    if (!lam || eh === undefined || ea === undefined) continue;
    let ph = 0, pd = 0, pa = 0;
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      const p = pois(lam.lh, i) * pois(lam.la, j);
      if (i > j) ph += p; else if (i === j) pd += p; else pa += p;
    }
    const eloHome = 1 / (1 + 10 ** (-(eh + 65 - ea) / 400));
    const homeDog = eloHome < 0.5;
    const usual = homeDog ? eloHome : 1 - eloHome;
    const model = homeDog ? ph + pd / 2 : pa + pd / 2;
    const win = homeDog ? ph : pa;
    if (model - usual >= 0.1 && win >= 0.3) upsets.push({
      matchId: r.id, fixture: `${r.home?.name ?? "Home"} vs ${r.away?.name ?? "Away"}`, league: r.league?.name ?? null, kickoffAt: r.kickoff_at,
      underdog: (homeDog ? r.home?.name : r.away?.name) ?? "Underdog", winChance: win, modelShare: model, usualShare: usual,
    });
  }
  upsets.sort((a, b) => (b.modelShare - b.usualShare) - (a.modelShare - a.usualShare));

  // Save today's picks for automatic grading (idempotent).
  try {
    const { logDailyPicks } = await import("@/lib/bet-log.server");
    await logDailyPicks(picks.map((p) => ({
      matchId: p.matchId, fixture: p.fixture, league: p.league, kickoffAt: p.kickoffAt,
      slipType: "match_pick", market: p.market, pickCode: p.code, selection: p.selection,
      probability: Number(p.probability.toFixed(4)), fairOdds: Number((1 / p.probability).toFixed(2)),
      facts: p.reasons, opinion: null, signals: p.sources ?? null,
    })));
  } catch {
    // logging is best-effort
  }

  const { data: history } = await sb.from("ai_bet_log").select("result, probability").eq("slip_type", "match_pick").in("result", ["hit", "miss"]).limit(5000);
  const settledPicks = history ?? [];
  const summary = settledPicks.length
    ? { picks: settledPicks.length, hits: settledPicks.filter((h) => h.result === "hit").length, expected: settledPicks.reduce((a, h) => a + Number(h.probability), 0) / settledPicks.length }
    : null;

  return { picks, noBets, track, signalTrack, reasonTrack, summary, generatedAt: now.toISOString() };
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
