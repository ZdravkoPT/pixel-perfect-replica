/**
 * Walk-forward "past 10 weeks" review of the AI bet builder.
 *
 * The model is refitted on everything that happened BEFORE each evaluation week,
 * then every fixture of that week is priced and any selection clearing the
 * confidence threshold is recorded as a bet and graded against the real result.
 * No result from the evaluation window ever leaks into the fit that priced it,
 * so the hit rate is an honest out-of-sample read on the builder.
 *
 * The per-market calibration multipliers produced here are fed back into the
 * live bet builder — that is the learning loop.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  applyMatch,
  blendedLambdas,
  buildStates,
  loadFinished,
  toDcMatches,
  type FinishedMatch,
} from "./analytics.server";
import { ELO_CONFIG } from "./models/elo";
import { fitDixonColes } from "./models/dixon-coles";
import { marketsFromMatrix, scorelineMatrix } from "./models/poisson";

/** Assumed bookmaker margin when translating fair odds into a payable price. */
const MARKET_MARGIN = 0.05;
/** Matches used for each weekly refit (most recent first). */
const FIT_WINDOW = 4000;

export type BetMarket =
  | "home"
  | "draw"
  | "away"
  | "over25"
  | "under25"
  | "btts"
  | "noBtts";

export interface BetHistorySummary {
  runId: string;
  status: "success" | "failed";
  weeks: number;
  matches: number;
  picks: number;
  wins: number;
  hitRate: number;
  expectedHitRate: number;
  roiFair: number;
  roiMarket: number;
  durationMs: number;
  error?: string;
}

interface Pick {
  match_id: string;
  kickoff_at: string;
  fixture: string;
  market: BetMarket;
  selection: string;
  probability: number;
  fair_odds: number;
  won: boolean;
  result: string;
}

function weekKey(iso: string): string {
  const date = new Date(iso);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

export async function runBetHistory(
  options: { weeks?: number; threshold?: number; triggeredBy?: string } = {},
): Promise<BetHistorySummary> {
  const weeks = options.weeks ?? 10;
  const threshold = options.threshold ?? 0.55;
  const triggeredBy = options.triggeredBy ?? "manual";
  const startedAt = Date.now();

  const { data: run } = await supabaseAdmin
    .from("bet_history_runs")
    .insert({ status: "running", triggered_by: triggeredBy, weeks, threshold })
    .select("id")
    .single();
  const runId = run?.id ?? "";

  try {
    const finished = await loadFinished();
    const cutoff = Date.now() - weeks * 7 * 86_400_000;
    const history = finished.filter((m) => new Date(m.kickoff_at).getTime() < cutoff);
    const window = finished.filter((m) => new Date(m.kickoff_at).getTime() >= cutoff);

    if (history.length < 300) {
      throw new Error(`Not enough pre-window history to backtest (have ${history.length}).`);
    }
    if (window.length === 0) {
      throw new Error("No finished matches inside the review window.");
    }

    // Team names for readable pick labels.
    const teamIds = [...new Set(window.flatMap((m) => [m.home_team_id, m.away_team_id]))];
    const names = new Map<string, string>();
    for (let i = 0; i < teamIds.length; i += 200) {
      const { data } = await supabaseAdmin
        .from("teams")
        .select("id, name")
        .in("id", teamIds.slice(i, i + 200));
      for (const team of data ?? []) names.set(team.id, team.name);
    }

    const trained: FinishedMatch[] = [...history];
    const states = buildStates(history);
    let params = fitDixonColes(toDcMatches(trained.slice(-FIT_WINDOW), cutoff), { iterations: 200 });
    let fittedWeek = weekKey(window[0]!.kickoff_at);

    const picks: Pick[] = [];
    let logLossSum = 0;
    let brierSum = 0;
    let graded = 0;

    for (const match of window) {
      const week = weekKey(match.kickoff_at);
      if (week !== fittedWeek) {
        // Refit on everything that finished before this week starts.
        params = fitDixonColes(
          toDcMatches(trained.slice(-FIT_WINDOW), new Date(match.kickoff_at).getTime()),
          { iterations: 200 },
        );
        fittedWeek = week;
      }

      const homeElo = states.get(match.home_team_id)?.elo ?? ELO_CONFIG.base;
      const awayElo = states.get(match.away_team_id)?.elo ?? ELO_CONFIG.base;
      const eloDiff = homeElo + ELO_CONFIG.homeAdvantage - awayElo;
      const { lambdaHome, lambdaAway } = blendedLambdas(
        params,
        match.home_team_id,
        match.away_team_id,
        eloDiff,
      );
      const markets = marketsFromMatrix(scorelineMatrix(lambdaHome, lambdaAway, params.rho));

      const homeName = names.get(match.home_team_id) ?? "Home";
      const awayName = names.get(match.away_team_id) ?? "Away";
      const total = match.home_score + match.away_score;
      const bothScored = match.home_score > 0 && match.away_score > 0;
      const outcome =
        match.home_score > match.away_score
          ? "HOME"
          : match.home_score === match.away_score
            ? "DRAW"
            : "AWAY";

      const options: Array<[BetMarket, string, number, boolean]> = [
        ["home", `${homeName} to win`, markets.home, outcome === "HOME"],
        ["draw", "Draw", markets.draw, outcome === "DRAW"],
        ["away", `${awayName} to win`, markets.away, outcome === "AWAY"],
        ["over25", "Over 2.5 goals", markets.over25, total > 2.5],
        ["under25", "Under 2.5 goals", markets.under25, total < 2.5],
        ["btts", "Both teams to score", markets.btts, bothScored],
        ["noBtts", "Both teams to score — no", markets.noBtts, !bothScored],
      ];

      // 1X2 accuracy metrics on every match, not just the ones we bet.
      const pActual = Math.max(
        outcome === "HOME" ? markets.home : outcome === "DRAW" ? markets.draw : markets.away,
        1e-9,
      );
      logLossSum += -Math.log(pActual);
      brierSum +=
        (Math.pow(markets.home - (outcome === "HOME" ? 1 : 0), 2) +
          Math.pow(markets.draw - (outcome === "DRAW" ? 1 : 0), 2) +
          Math.pow(markets.away - (outcome === "AWAY" ? 1 : 0), 2)) /
        3;
      graded += 1;

      for (const [market, selection, probability, won] of options) {
        if (probability < threshold) continue;
        picks.push({
          match_id: match.id,
          kickoff_at: match.kickoff_at,
          fixture: `${homeName} vs ${awayName}`,
          market,
          selection,
          probability: Number(probability.toFixed(5)),
          fair_odds: Number((1 / probability).toFixed(4)),
          won,
          result: `${match.home_score}-${match.away_score}`,
        });
      }

      trained.push(match);
      applyMatch(states, match);
    }

    const wins = picks.filter((p) => p.won).length;
    const hitRate = picks.length ? wins / picks.length : 0;
    const expectedHitRate = picks.length
      ? picks.reduce((acc, p) => acc + p.probability, 0) / picks.length
      : 0;
    const roiFair = picks.length
      ? picks.reduce((acc, p) => acc + (p.won ? p.fair_odds - 1 : -1), 0) / picks.length
      : 0;
    const roiMarket = picks.length
      ? picks.reduce(
          (acc, p) => acc + (p.won ? p.fair_odds * (1 - MARKET_MARGIN) - 1 : -1),
          0,
        ) / picks.length
      : 0;

    // Per-market breakdown plus the shrunk calibration multiplier the live
    // builder reuses. Shrinkage keeps thin samples from swinging live prices.
    const marketKeys = [...new Set(picks.map((p) => p.market))];
    const byMarket = marketKeys
      .map((market) => {
        const rows = picks.filter((p) => p.market === market);
        const marketWins = rows.filter((p) => p.won).length;
        const expected = rows.reduce((acc, p) => acc + p.probability, 0);
        const prior = 25;
        const multiplier = Math.min(
          1.2,
          Math.max(0.8, (marketWins + prior) / (expected + prior)),
        );
        return {
          market,
          picks: rows.length,
          wins: marketWins,
          hitRate: Number((marketWins / rows.length).toFixed(4)),
          expectedHitRate: Number((expected / rows.length).toFixed(4)),
          roiMarket: Number(
            (
              rows.reduce((acc, p) => acc + (p.won ? p.fair_odds * (1 - MARKET_MARGIN) - 1 : -1), 0) /
              rows.length
            ).toFixed(4),
          ),
          multiplier: Number(multiplier.toFixed(4)),
        };
      })
      .sort((a, b) => b.picks - a.picks);

    const weeklyMap = new Map<string, { picks: number; wins: number; expected: number; profit: number }>();
    for (const pick of picks) {
      const key = weekKey(pick.kickoff_at);
      const entry = weeklyMap.get(key) ?? { picks: 0, wins: 0, expected: 0, profit: 0 };
      entry.picks += 1;
      entry.wins += pick.won ? 1 : 0;
      entry.expected += pick.probability;
      entry.profit += pick.won ? pick.fair_odds * (1 - MARKET_MARGIN) - 1 : -1;
      weeklyMap.set(key, entry);
    }
    const weekly = [...weeklyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, entry]) => ({
        week,
        picks: entry.picks,
        wins: entry.wins,
        hitRate: Number((entry.wins / entry.picks).toFixed(4)),
        expectedHitRate: Number((entry.expected / entry.picks).toFixed(4)),
        profit: Number(entry.profit.toFixed(3)),
      }));

    const bins = Array.from({ length: 10 }, (_, i) => ({
      bucket: `${i * 10}-${i * 10 + 10}%`,
      predicted: 0,
      observed: 0,
      count: 0,
    }));
    for (const pick of picks) {
      const bin = bins[Math.min(9, Math.floor(pick.probability * 10))]!;
      bin.count += 1;
      bin.predicted += pick.probability;
      bin.observed += pick.won ? 1 : 0;
    }
    const calibration = bins
      .filter((bin) => bin.count > 0)
      .map((bin) => ({
        bucket: bin.bucket,
        count: bin.count,
        predicted: Number((bin.predicted / bin.count).toFixed(4)),
        observed: Number((bin.observed / bin.count).toFixed(4)),
      }));

    for (let i = 0; i < picks.length; i += 300) {
      await supabaseAdmin
        .from("bet_history_picks")
        .insert(picks.slice(i, i + 300).map((pick) => ({ ...pick, run_id: runId })));
    }

    const durationMs = Date.now() - startedAt;
    await supabaseAdmin
      .from("bet_history_runs")
      .update({
        status: "success",
        window_from: window[0]?.kickoff_at ?? null,
        window_to: window[window.length - 1]?.kickoff_at ?? null,
        matches: window.length,
        picks: picks.length,
        wins,
        hit_rate: Number(hitRate.toFixed(4)),
        expected_hit_rate: Number(expectedHitRate.toFixed(4)),
        roi_fair: Number(roiFair.toFixed(4)),
        roi_market: Number(roiMarket.toFixed(4)),
        log_loss: Number((logLossSum / Math.max(graded, 1)).toFixed(4)),
        brier: Number((brierSum / Math.max(graded, 1)).toFixed(4)),
        by_market: byMarket,
        weekly,
        calibration,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("id", runId);

    return {
      runId,
      status: "success",
      weeks,
      matches: window.length,
      picks: picks.length,
      wins,
      hitRate,
      expectedHitRate,
      roiFair,
      roiMarket,
      durationMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin
      .from("bet_history_runs")
      .update({
        status: "failed",
        error: message.slice(0, 500),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", runId);
    return {
      runId,
      status: "failed",
      weeks,
      matches: 0,
      picks: 0,
      wins: 0,
      hitRate: 0,
      expectedHitRate: 0,
      roiFair: 0,
      roiMarket: 0,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}
