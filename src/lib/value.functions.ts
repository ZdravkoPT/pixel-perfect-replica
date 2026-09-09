import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

type MatchRow = {
  id: string;
  kickoff_at: string;
  home_team_id: string;
  away_team_id: string;
  league: { name: string } | null;
  home: { id: string; name: string } | null;
  away: { id: string; name: string } | null;
};

function odds(p: number): number {
  return p > 0 ? 1 / p : 0;
}

/**
 * Value board: every upcoming fixture with its 1X2 fair odds, how those odds have
 * moved between the first and the latest immutable prediction, and the strongest
 * player-prop projections attached to that fixture.
 */
export const getValueBoard = createServerFn({ method: "GET" })
  .inputValidator((input: { hours?: number } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const hours = data.hours ?? 96;
    const now = new Date();
    const until = new Date(now.getTime() + hours * 3600_000);

    const { data: matches } = await supabase
      .from("matches")
      .select(
        "id, kickoff_at, home_team_id, away_team_id, league:leagues(name), home:teams!matches_home_team_id_fkey(id, name), away:teams!matches_away_team_id_fkey(id, name)",
      )
      .gte("kickoff_at", now.toISOString())
      .lte("kickoff_at", until.toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(60);

    const rows = (matches ?? []) as unknown as MatchRow[];
    if (rows.length === 0) return { matches: [], generatedAt: now.toISOString() };

    const ids = rows.map((row) => row.id);
    const [{ data: predictions }, { data: props }, { data: lineupRows }] = await Promise.all([
      supabase
        .from("predictions")
        .select("match_id, prediction_timestamp, p_home, p_draw, p_away, p_over_25, p_btts, confidence")
        .in("match_id", ids)
        .order("prediction_timestamp", { ascending: true }),
      supabase
        .from("player_prop_predictions")
        .select(
          "match_id, market, selection, probability, fair_odds, expected_minutes, team_id, prediction_timestamp, player:players(id, name, position)",
        )
        .in("match_id", ids)
        .gte("probability", 0.18)
        .order("probability", { ascending: false })
        .limit(1200),
      supabase
        .from("lineups")
        .select(
          "match_id, team_id, is_predicted, confidence, updated_at, players:lineup_players(player_id, is_starter, expected_minutes, start_probability)",
        )
        .in("match_id", ids),
    ]);

    type LineupInfo = {
      confirmed: boolean;
      updatedAt: string | null;
      players: Map<
        string,
        { isStarter: boolean; expectedMinutes: number | null; startProbability: number | null }
      >;
    };

    const lineupByMatch = new Map<string, LineupInfo>();
    for (const lineup of lineupRows ?? []) {
      const info =
        lineupByMatch.get(lineup.match_id) ??
        ({ confirmed: false, updatedAt: null, players: new Map() } as LineupInfo);
      if (!lineup.is_predicted) info.confirmed = true;
      if (lineup.updated_at && (!info.updatedAt || lineup.updated_at > info.updatedAt)) {
        info.updatedAt = lineup.updated_at;
      }
      for (const row of lineup.players ?? []) {
        info.players.set(row.player_id, {
          isStarter: row.is_starter,
          expectedMinutes: row.expected_minutes === null ? null : Number(row.expected_minutes),
          startProbability: row.start_probability === null ? null : Number(row.start_probability),
        });
      }
      lineupByMatch.set(lineup.match_id, info);
    }


    const byMatch = new Map<string, typeof predictions>();
    for (const row of predictions ?? []) {
      const list = byMatch.get(row.match_id) ?? [];
      list.push(row);
      byMatch.set(row.match_id, list);
    }

    const propsByMatch = new Map<string, NonNullable<typeof props>>();
    for (const row of props ?? []) {
      const list = propsByMatch.get(row.match_id) ?? [];
      list.push(row);
      propsByMatch.set(row.match_id, list);
    }

    const board = rows.map((match) => {
      const history = byMatch.get(match.id) ?? [];
      const first = history[0] ?? null;
      const latest = history[history.length - 1] ?? null;
      const selections =
        latest === null
          ? []
          : ([
              { key: "home", label: match.home?.name ?? "Home", p: Number(latest.p_home), p0: Number(first?.p_home ?? latest.p_home) },
              { key: "draw", label: "Draw", p: Number(latest.p_draw), p0: Number(first?.p_draw ?? latest.p_draw) },
              { key: "away", label: match.away?.name ?? "Away", p: Number(latest.p_away), p0: Number(first?.p_away ?? latest.p_away) },
              latest.p_over_25 !== null
                ? { key: "over25", label: "Over 2.5", p: Number(latest.p_over_25), p0: Number(first?.p_over_25 ?? latest.p_over_25) }
                : null,
              latest.p_btts !== null
                ? { key: "btts", label: "Both teams score", p: Number(latest.p_btts), p0: Number(first?.p_btts ?? latest.p_btts) }
                : null,
            ].filter(Boolean) as Array<{ key: string; label: string; p: number; p0: number }>);

      const lineup = lineupByMatch.get(match.id) ?? null;
      const lineupStatus = lineup === null ? "none" : lineup.confirmed ? "confirmed" : "projected";

      const propRows = (propsByMatch.get(match.id) ?? [])
        .slice()
        // Only price players who are actually on the latest team sheet, and prefer
        // starters — a projection for someone outside the XI is not real value.
        .filter((row) => {
          if (lineup === null || !row.player?.id) return lineup === null;
          const entry = lineup.players.get(row.player.id);
          return Boolean(entry?.isStarter);
        })
        .sort((a, b) => Number(b.probability) - Number(a.probability))
        .slice(0, 6)
        .map((row) => {
          const entry = row.player?.id ? (lineup?.players.get(row.player.id) ?? null) : null;
          return {
            player: row.player?.name ?? "Unknown",
            position: row.player?.position ?? null,
            team:
              row.team_id === match.home_team_id
                ? (match.home?.name ?? "Home")
                : (match.away?.name ?? "Away"),
            market: row.market,
            selection: row.selection,
            probability: Number(row.probability),
            fairOdds: Number(row.fair_odds),
            expectedMinutes:
              entry?.expectedMinutes ??
              (row.expected_minutes === null ? null : Number(row.expected_minutes)),
            startProbability: entry?.startProbability ?? null,
            lineupStatus,
          };
        });

      return {
        matchId: match.id,
        kickoffAt: match.kickoff_at,
        league: match.league?.name ?? "Unknown league",
        homeName: match.home?.name ?? "Home",
        awayName: match.away?.name ?? "Away",
        revisions: history.length,
        firstPricedAt: first?.prediction_timestamp ?? null,
        lastPricedAt: latest?.prediction_timestamp ?? null,
        confidence: latest?.confidence === null || latest === null ? null : Number(latest.confidence),
        lineupStatus,
        lineupUpdatedAt: lineup?.updatedAt ?? null,
        selections: selections.map((row) => ({
          key: row.key,
          label: row.label,
          probability: row.p,
          fairOdds: odds(row.p),
          openingFairOdds: odds(row.p0),
          drift: odds(row.p) - odds(row.p0),
        })),
        props: propRows,
      };
    });

    return { matches: board, generatedAt: now.toISOString() };
  });

/** Average age and nationality mix for the two squads in a fixture. */
export const getSquadProfile = createServerFn({ method: "GET" })
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: match } = await supabase
      .from("matches")
      .select(
        "home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)",
      )
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) return { teams: [] };

    const teamIds = [match.home_team_id, match.away_team_id];
    const { data: squad } = await supabase
      .from("squad_memberships")
      .select("team_id, player:players(id, birth_date, nationality, position)")
      .in("team_id", teamIds)
      .eq("is_current", true);

    const teams = teamIds.map((teamId, index) => {
      const rows = (squad ?? []).filter((row) => row.team_id === teamId);
      const ages = rows
        .map((row) => row.player?.birth_date)
        .filter((value): value is string => Boolean(value))
        .map((value) => (Date.now() - new Date(value).getTime()) / (365.25 * 24 * 3600_000));
      const nations = new Map<string, number>();
      for (const row of rows) {
        const nation = row.player?.nationality ?? "Unknown";
        nations.set(nation, (nations.get(nation) ?? 0) + 1);
      }
      return {
        teamId,
        name: index === 0 ? (match.home?.name ?? "Home") : (match.away?.name ?? "Away"),
        squadSize: rows.length,
        averageAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
        youngest: ages.length ? Math.min(...ages) : null,
        oldest: ages.length ? Math.max(...ages) : null,
        nations: [...nations.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([nation, count]) => ({ nation, count })),
        nationCount: nations.size,
      };
    });

    return { teams };
  });

type Candidate = {
  matchId: string;
  fixture: string;
  league: string;
  kickoffAt: string;
  market: string;
  selection: string;
  probability: number;
  adjustedProbability: number;
  fairOdds: number;
  confidence: number | null;
  kind: "match" | "player";
  lineupStatus: "confirmed" | "projected" | "none";
  score: number;
};

/** Latest completed 10-week review, used both for display and for calibration. */
async function loadCalibration(supabase: ReturnType<typeof publicClient>) {
  const { data } = await supabase
    .from("bet_history_runs")
    .select(
      "id, weeks, threshold, window_from, window_to, matches, picks, wins, hit_rate, expected_hit_rate, roi_fair, roi_market, log_loss, brier, by_market, weekly, calibration, finished_at",
    )
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { run: null, multipliers: new Map<string, number>() };

  const multipliers = new Map<string, number>();
  for (const row of (data.by_market ?? []) as Array<{ market: string; multiplier: number }>) {
    if (row?.market && Number.isFinite(row.multiplier)) multipliers.set(row.market, Number(row.multiplier));
  }
  return { run: data, multipliers };
}

/** Public read of the past-N-week bet-builder scorecard. */
export const getBetHistory = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { run } = await loadCalibration(supabase);
  if (!run) return { run: null, recent: [] };

  const { data: recent } = await supabase
    .from("bet_history_picks")
    .select("kickoff_at, fixture, market, selection, probability, fair_odds, won, result")
    .eq("run_id", run.id)
    .order("kickoff_at", { ascending: false })
    .limit(40);

  return { run, recent: recent ?? [] };
});

/**
 * Today's strongest model signals, calibrated against the last 10 weeks of
 * graded bets, plus a programmatically built accumulator and an AI brief.
 * Every number handed to the model comes from stored immutable predictions.
 */
export const getAiBets = createServerFn({ method: "GET" })
  .inputValidator((input: { minProbability?: number } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const min = data.minProbability ?? 0.55;
    const now = new Date();
    const end = new Date(now);
    end.setUTCHours(23, 59, 59, 999);

    const { run: historyRun, multipliers } = await loadCalibration(supabase);

    const { data: matches } = await supabase
      .from("matches")
      .select(
        "id, kickoff_at, home_team_id, league:leagues(name), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)",
      )
      .gte("kickoff_at", now.toISOString())
      .lte("kickoff_at", end.toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(40);

    const rows = (matches ?? []) as unknown as Array<MatchRow & { home_team_id: string }>;
    if (rows.length === 0) {
      return {
        candidates: [],
        builder: null,
        history: historyRun,
        brief: null,
        generatedAt: now.toISOString(),
        reason: "no-fixtures" as const,
      };
    }

    const ids = rows.map((row) => row.id);
    const [{ data: predictions }, { data: props }, { data: lineupRows }] = await Promise.all([
      supabase
        .from("predictions")
        .select(
          "match_id, prediction_timestamp, p_home, p_draw, p_away, p_over_25, p_under_25, p_btts, confidence, lambda_home, lambda_away, expected_goals, top_scoreline",
        )
        .in("match_id", ids)
        .order("prediction_timestamp", { ascending: false }),
      supabase
        .from("player_prop_predictions")
        .select("match_id, market, selection, probability, fair_odds, team_id, player:players(name)")
        .in("match_id", ids)
        .gte("probability", min)
        .order("probability", { ascending: false })
        .limit(60),
      supabase.from("lineups").select("match_id, is_predicted").in("match_id", ids),
    ]);


    const lineupStatusByMatch = new Map<string, "confirmed" | "projected">();
    for (const row of lineupRows ?? []) {
      if (!row.is_predicted) lineupStatusByMatch.set(row.match_id, "confirmed");
      else if (!lineupStatusByMatch.has(row.match_id)) lineupStatusByMatch.set(row.match_id, "projected");
    }

    const latest = new Map<string, NonNullable<typeof predictions>[number]>();
    for (const row of predictions ?? []) if (!latest.has(row.match_id)) latest.set(row.match_id, row);

    const adjust = (market: string, probability: number) =>
      Math.min(0.97, Math.max(0.02, probability * (multipliers.get(market) ?? 1)));

    const candidates: Candidate[] = [];
    for (const match of rows) {
      const prediction = latest.get(match.id);
      if (!prediction) continue;
      const fixture = `${match.home?.name ?? "Home"} vs ${match.away?.name ?? "Away"}`;
      const lineupStatus = lineupStatusByMatch.get(match.id) ?? "none";
      const confidence = prediction.confidence === null ? null : Number(prediction.confidence);
      const options: Array<[string, string, number | null]> = [
        ["home", `${match.home?.name ?? "Home"} to win`, Number(prediction.p_home)],
        ["draw", "Draw", Number(prediction.p_draw)],
        ["away", `${match.away?.name ?? "Away"} to win`, Number(prediction.p_away)],
        ["over25", "Over 2.5 goals", prediction.p_over_25 === null ? null : Number(prediction.p_over_25)],
        ["under25", "Under 2.5 goals", prediction.p_under_25 === null ? null : Number(prediction.p_under_25)],
        ["btts", "Both teams to score", prediction.p_btts === null ? null : Number(prediction.p_btts)],
      ];
      for (const [market, selection, probability] of options) {
        if (probability === null || probability < min) continue;
        const adjusted = adjust(market, probability);
        candidates.push({
          matchId: match.id,
          fixture,
          league: match.league?.name ?? "Unknown league",
          kickoffAt: match.kickoff_at,
          market,
          selection,
          probability,
          adjustedProbability: adjusted,
          fairOdds: odds(adjusted),
          confidence,
          kind: "match",
          lineupStatus,
          // Rank on the calibrated probability, nudged by model confidence and
          // by whether a real team sheet is already known.
          score:
            adjusted *
            (1 + 0.15 * (confidence ?? 0.5)) *
            (lineupStatus === "confirmed" ? 1.06 : lineupStatus === "projected" ? 1 : 0.98),
        });
      }
    }

    for (const row of props ?? []) {
      const match = rows.find((item) => item.id === row.match_id);
      if (!match) continue;
      const lineupStatus = lineupStatusByMatch.get(row.match_id) ?? "none";
      const probability = Number(row.probability);
      const adjusted = adjust(row.market, probability);
      candidates.push({
        matchId: row.match_id,
        fixture: `${match.home?.name ?? "Home"} vs ${match.away?.name ?? "Away"}`,
        league: match.league?.name ?? "Unknown league",
        kickoffAt: match.kickoff_at,
        market: row.market,
        selection: `${row.player?.name ?? "Player"} · ${row.selection.replace(/_/g, " ")}`,
        probability,
        adjustedProbability: adjusted,
        fairOdds: odds(adjusted),
        confidence: null,
        kind: "player",
        lineupStatus,
        // Player props without a confirmed sheet carry line-up risk on top of
        // model risk, so they are discounted relative to match markets.
        score: adjusted * (lineupStatus === "confirmed" ? 1 : 0.85),
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const shortlist = candidates.slice(0, 24);

    // ---- Mega slip: one leg for every fixture today, up to 20 -------------
    // For every fixture we build a full market menu out of the stored model
    // output (1X2, double chance, Poisson goal lines, both-teams-to-score) and
    // pick the leg with the best mix of safety and price after calibration and
    // a reliability discount for stale predictions / unknown line-ups.
    type MegaLeg = {
      matchId: string;
      fixture: string;
      league: string;
      kickoffAt: string;
      market: "1x2" | "double_chance" | "goals" | "btts" | "over05";
      pickCode: string;
      marketLabel: string;
      selection: string;
      probability: number;
      modelProbability: number;
      fairOdds: number;
      confidence: number | null;
      lineupStatus: "confirmed" | "projected" | "none";
      facts: string[];
      opinion?: string;
    };

    // Independent-Poisson scoreline grid from the stored goal rates.
    const poissonGrid = (lh: number, la: number) => {
      const pmf = (lambda: number, k: number) => {
        let p = Math.exp(-lambda);
        for (let i = 1; i <= k; i += 1) p = (p * lambda) / i;
        return p;
      };
      const max = 9;
      const grid: number[][] = [];
      for (let h = 0; h <= max; h += 1) {
        const row: number[] = [];
        for (let a = 0; a <= max; a += 1) row.push(pmf(lh, h) * pmf(la, a));
        grid.push(row);
      }
      const cell = (h: number, a: number) => grid[h]?.[a] ?? 0;
      const totalAtMost = (line: number) => {
        let acc = 0;
        for (let h = 0; h <= max; h += 1)
          for (let a = 0; a <= max; a += 1) if (h + a <= line) acc += cell(h, a);
        return acc;
      };
      let bttsNo = 0;
      for (let h = 0; h <= max; h += 1)
        for (let a = 0; a <= max; a += 1) if (h === 0 || a === 0) bttsNo += cell(h, a);

      return {
        over: (line: number) => Math.max(0, Math.min(1, 1 - totalAtMost(Math.floor(line)))),
        under: (line: number) => Math.max(0, Math.min(1, totalAtMost(Math.floor(line)))),
        bttsNo: Math.max(0, Math.min(1, bttsNo)),
      };
    };

    const megaLegs: MegaLeg[] = [];
    for (const match of rows) {
      const prediction = latest.get(match.id);
      if (!prediction) continue;
      const homeName = match.home?.name ?? "Home";
      const awayName = match.away?.name ?? "Away";
      const fixture = `${homeName} vs ${awayName}`;
      const lineupStatus = lineupStatusByMatch.get(match.id) ?? "none";
      const confidence = prediction.confidence === null ? null : Number(prediction.confidence);
      const pHome = Number(prediction.p_home);
      const pDraw = Number(prediction.p_draw);
      const pAway = Number(prediction.p_away);
      const lh = Number(prediction.lambda_home ?? 0);
      const la = Number(prediction.lambda_away ?? 0);
      const total = lh + la;
      const grid = total > 0 ? poissonGrid(lh, la) : null;

      // Reliability: how much we trust the stored numbers for this fixture.
      const ageHours =
        (now.getTime() - new Date(prediction.prediction_timestamp).getTime()) / 3_600_000;
      const reliability =
        (lineupStatus === "confirmed" ? 1 : lineupStatus === "projected" ? 0.985 : 0.97) *
        (ageHours > 48 ? 0.96 : ageHours > 12 ? 0.985 : 1) *
        (0.97 + 0.03 * (confidence ?? 0.5));
      // Shrink every probability towards a neutral 0.5 by the reliability gap so
      // over-confident model calls cannot dominate the slip.
      const temper = (p: number) => 0.5 + (p - 0.5) * reliability;

      type Option = {
        market: MegaLeg["market"];
        marketLabel: string;
        selection: string;
        calibrationKey: string;
        p: number;
      };
      const options: Option[] = [
        { market: "1x2", marketLabel: "Match result", selection: `${homeName} to win`, calibrationKey: "home", p: pHome },
        { market: "1x2", marketLabel: "Match result", selection: "Draw", calibrationKey: "draw", p: pDraw },
        { market: "1x2", marketLabel: "Match result", selection: `${awayName} to win`, calibrationKey: "away", p: pAway },
        { market: "double_chance", marketLabel: "Double chance", selection: `${homeName} or draw`, calibrationKey: "dc_home", p: pHome + pDraw },
        { market: "double_chance", marketLabel: "Double chance", selection: `${awayName} or draw`, calibrationKey: "dc_away", p: pAway + pDraw },
        { market: "double_chance", marketLabel: "Double chance", selection: "Home or away (no draw)", calibrationKey: "dc_nodraw", p: pHome + pAway },
      ];
      if (grid) {
        options.push(
          { market: "over05", marketLabel: "Goals", selection: "Over 0.5 goals", calibrationKey: "over05", p: grid.over(0.5) },
          { market: "goals", marketLabel: "Goals", selection: "Over 1.5 goals", calibrationKey: "over15", p: grid.over(1.5) },
          { market: "goals", marketLabel: "Goals", selection: "Under 4.5 goals", calibrationKey: "under45", p: grid.under(4.5) },
          { market: "goals", marketLabel: "Goals", selection: "Under 3.5 goals", calibrationKey: "under35", p: grid.under(3.5) },
        );
      }
      if (prediction.p_over_25 !== null)
        options.push({ market: "goals", marketLabel: "Goals", selection: "Over 2.5 goals", calibrationKey: "over25", p: Number(prediction.p_over_25) });
      if (prediction.p_btts !== null) {
        const btts = Number(prediction.p_btts);
        options.push({ market: "btts", marketLabel: "Both teams to score", selection: "Both teams to score", calibrationKey: "btts", p: btts });
        options.push({ market: "btts", marketLabel: "Both teams to score", selection: "Both teams to score — no", calibrationKey: "btts_no", p: grid ? grid.bttsNo : 1 - btts });
      }

      const priced = options
        .filter((option) => Number.isFinite(option.p) && option.p > 0)
        .map((option) => {
          const calibrated = Math.min(0.985, Math.max(0.02, adjust(option.calibrationKey, option.p)));
          const probability = Math.min(0.985, Math.max(0.02, temper(calibrated)));
          return { ...option, probability };
        });
      if (priced.length === 0) continue;

      // Safety floor first, then take the best price among the safe options so
      // the slip is not made of near-certain 1.02 legs that add no value.
      const safeFloor = 0.72;
      const safe = priced.filter((option) => option.probability >= safeFloor);
      const pool = safe.length > 0 ? safe : priced;
      const pick = pool.reduce((best, option) => {
        const score = (candidate: typeof option) =>
          safe.length > 0
            ? // among safe options prefer the longest price, lightly weighted by safety
              (1 / candidate.probability) * Math.pow(candidate.probability, 0.35)
            : candidate.probability;
        return score(option) > score(best) ? option : best;
      });

      const facts = [
        `Goal rates ${lh.toFixed(2)} – ${la.toFixed(2)} (${Number(prediction.expected_goals ?? total).toFixed(2)} total)`,
        `1X2 ${(pHome * 100).toFixed(0)}/${(pDraw * 100).toFixed(0)}/${(pAway * 100).toFixed(0)}`,
        grid ? `Over 1.5 ${(grid.over(1.5) * 100).toFixed(0)}% · Under 4.5 ${(grid.under(4.5) * 100).toFixed(0)}%` : null,
        prediction.p_over_25 === null ? null : `Over 2.5 ${(Number(prediction.p_over_25) * 100).toFixed(0)}%`,
        prediction.p_btts === null ? null : `Both score ${(Number(prediction.p_btts) * 100).toFixed(0)}%`,
        prediction.top_scoreline ? `Most likely score ${prediction.top_scoreline}` : null,
        `Model call ${(pick.p * 100).toFixed(0)}% → calibrated ${(pick.probability * 100).toFixed(0)}%`,
        lineupStatus === "confirmed"
          ? "Confirmed team sheet"
          : lineupStatus === "projected"
            ? "Projected line-up only"
            : "No line-up published yet",
      ].filter((value): value is string => Boolean(value));

      megaLegs.push({
        matchId: match.id,
        fixture,
        league: match.league?.name ?? "Unknown league",
        kickoffAt: match.kickoff_at,
        market: pick.market,
        pickCode: pick.calibrationKey,
        marketLabel: pick.marketLabel,
        selection: pick.selection,
        probability: pick.probability,
        modelProbability: pick.p,
        fairOdds: odds(pick.probability),
        confidence,
        lineupStatus,
        facts,
      });
    }
    // Keep the twenty most reliable legs, then present them by kick-off time.
    const slipLegs = megaLegs
      .slice()
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 20)
      .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
    const slipProbability = slipLegs.reduce((acc, leg) => acc * leg.probability, 1);
    const megaSlip =
      slipLegs.length >= 2
        ? {
            legs: slipLegs,
            probability: slipProbability,
            fairOdds: odds(slipProbability),
            oneX2Legs: slipLegs.filter((leg) => leg.market === "1x2").length,
            over05Legs: slipLegs.filter((leg) => leg.market === "over05").length,
            averageProbability:
              slipLegs.reduce((acc, leg) => acc + leg.probability, 0) / slipLegs.length,
            marketMix: Array.from(
              slipLegs.reduce((map, leg) => {
                map.set(leg.marketLabel, (map.get(leg.marketLabel) ?? 0) + 1);
                return map;
              }, new Map<string, number>()),
            ).map(([label, count]) => ({ label, count })),
          }
        : null;


    if (shortlist.length === 0) {
      return {
        candidates: [],
        builder: null,
        megaSlip,
        record: { today: [], recent: [], summary: null } as Awaited<ReturnType<typeof loadBetLog>>,
        history: historyRun,
        brief: null,
        generatedAt: now.toISOString(),
        reason: "no-signals" as const,
      };
    }


    // Programmatic accumulator: strongest calibrated leg per fixture, at most
    // one leg per match so the legs stay statistically independent.
    const usedMatches = new Set<string>();
    const legs = shortlist
      .filter((row) => {
        if (usedMatches.has(row.matchId)) return false;
        usedMatches.add(row.matchId);
        return true;
      })
      .slice(0, 4);
    const combined = legs.reduce((acc, leg) => acc * leg.adjustedProbability, 1);
    const builder =
      legs.length >= 2
        ? {
            legs: legs.map((leg) => ({
              matchId: leg.matchId,
              fixture: leg.fixture,
              selection: leg.selection,
              probability: leg.adjustedProbability,
              fairOdds: leg.fairOdds,
            })),
            probability: combined,
            fairOdds: odds(combined),
          }
        : null;

    let brief: string | null = null;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (apiKey) {
      const historyLine = historyRun
        ? `Graded record over the last ${historyRun.weeks} weeks: ${historyRun.wins}/${historyRun.picks} bets won (${((Number(historyRun.hit_rate) || 0) * 100).toFixed(1)}% hit rate vs ${((Number(historyRun.expected_hit_rate) || 0) * 100).toFixed(1)}% expected, return per unit at a typical bookmaker price ${((Number(historyRun.roi_market) || 0) * 100).toFixed(1)}%). Per market: ${(
            (historyRun.by_market ?? []) as Array<{
              market: string;
              picks: number;
              hitRate: number;
              expectedHitRate: number;
              roiMarket: number;
            }>
          )
            .map(
              (row) =>
                `${row.market} ${row.picks} bets, ${(row.hitRate * 100).toFixed(0)}% actual vs ${(row.expectedHitRate * 100).toFixed(0)}% expected, ROI ${(row.roiMarket * 100).toFixed(0)}%`,
            )
            .join("; ")}.`
        : "No graded history is available yet.";

      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3.7-flash",
            messages: [
              {
                role: "system",
                content:
                  "You are a disciplined football betting analyst. Use ONLY the supplied model probabilities and the supplied graded track record. " +
                  "The probabilities are already calibrated against that record. No bookmaker prices are available, so never claim a price beats the market. " +
                  "Lean into markets whose historical actual hit rate beat expectation and stay away from markets that underperformed — say so explicitly. " +
                  "Answer in markdown with four short sections: 'Track record read' (2 bullets on what the past weeks say about which markets to trust), " +
                  "'Top singles' (max 4 bullets, each with the calibrated probability and fair odds), " +
                  "'Bet builder' (comment on the pre-built accumulator, state the combined probability and fair odds, and flag correlation or line-up risk), " +
                  "and 'Avoid' (1-2 bullets on the weakest or most volatile signals). Be concise and never promise profit.",
              },
              {
                role: "user",
                content:
                  `${historyLine}\n\nToday's calibrated signals:\n${shortlist
                    .map(
                      (row) =>
                        `- ${row.fixture} (${row.league}, ${new Date(row.kickoffAt).toISOString().slice(11, 16)} UTC): ${row.selection} — ${(row.adjustedProbability * 100).toFixed(1)}% @ ${row.fairOdds.toFixed(2)} [raw ${(row.probability * 100).toFixed(1)}%, market ${row.market}, line-up ${row.lineupStatus}]${row.confidence ? `, model confidence ${(row.confidence * 100).toFixed(0)}%` : ""}`,
                    )
                    .join("\n")}` +
                  (builder
                    ? `\n\nPre-built accumulator (one leg per match, independent): ${builder.legs
                        .map((leg) => `${leg.selection} (${(leg.probability * 100).toFixed(1)}%)`)
                        .join(" + ")} = ${(builder.probability * 100).toFixed(1)}% @ ${builder.fairOdds.toFixed(2)}`
                    : "") +
                  (megaSlip
                    ? `\n\nMega slip of ${megaSlip.legs.length} matches (${megaSlip.oneX2Legs} match-result legs, ${megaSlip.over05Legs} over 0.5 goals legs), combined ${(megaSlip.probability * 100).toFixed(2)}% @ ${megaSlip.fairOdds.toFixed(2)}: ${megaSlip.legs
                        .map((leg) => `${leg.fixture} ${leg.selection} (${(leg.probability * 100).toFixed(1)}%)`)
                        .join("; ")}`
                    : ""),
              },
            ],
          }),
        });
        if (response.ok) {
          const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
          brief = payload.choices?.[0]?.message?.content ?? null;
        }
      } catch {
        brief = null;
      }

      // Per-match opinions for the mega slip, one short verdict each.
      if (megaSlip) {
        try {
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3.7-flash",
              messages: [
                {
                  role: "system",
                  content:
                    "You write one-sentence betting verdicts per match using ONLY the supplied model numbers. " +
                    "Return JSON only: an object with key \"opinions\", an array of {\"matchId\":string,\"opinion\":string}. " +
                    "Each opinion is max 25 words, mentions the key number, and flags line-up or volatility risk when relevant. Never promise profit.",
                },
                {
                  role: "user",
                  content: megaSlip.legs
                    .map(
                      (leg) =>
                        `matchId ${leg.matchId}: ${leg.fixture} (${leg.league}) — pick ${leg.selection} at ${(leg.probability * 100).toFixed(1)}%. Facts: ${leg.facts.join("; ")}`,
                    )
                    .join("\n"),
                },
              ],
              response_format: { type: "json_object" },
            }),
          });
          if (response.ok) {
            const payload = (await response.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const raw = payload.choices?.[0]?.message?.content;
            if (raw) {
              const parsed = JSON.parse(raw) as {
                opinions?: Array<{ matchId?: string; opinion?: string }>;
              };
              const byId = new Map(
                (parsed.opinions ?? [])
                  .filter((row) => row.matchId && row.opinion)
                  .map((row) => [row.matchId as string, row.opinion as string]),
              );
              for (const leg of megaSlip.legs) {
                const opinion = byId.get(leg.matchId);
                if (opinion) leg.opinion = opinion;
              }
            }
          }
        } catch {
          // opinions are optional; the slip stands without them
        }
      }
    }

    // Record today's slip so every pick can be graded hit / miss later, and
    // settle anything already played out.
    let record: Awaited<ReturnType<typeof loadBetLog>> = { today: [], recent: [], summary: null };
    try {
      const { logDailyPicks, settlePendingPicks } = await import("./bet-log.server");
      if (megaSlip) {
        await logDailyPicks(
          megaSlip.legs.map((leg) => ({
            matchId: leg.matchId,
            fixture: leg.fixture,
            league: leg.league,
            kickoffAt: leg.kickoffAt,
            slipType: "mega" as const,
            market: leg.marketLabel,
            pickCode: leg.pickCode,
            selection: leg.selection,
            probability: leg.probability,
            fairOdds: leg.fairOdds,
            facts: leg.facts,
            opinion: leg.opinion ?? null,
          })),
        );
      }
      await settlePendingPicks();
      record = await loadBetLog();
    } catch {
      // the log is a bonus; the page still renders without it
    }

    return {
      candidates: shortlist,
      builder,
      megaSlip,
      record,
      history: historyRun,
      brief,
      generatedAt: now.toISOString(),
      reason: "ok" as const,
    };
  });
