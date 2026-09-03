import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { ELO_CONFIG, expectedScore, regressToMean, updateElo } from "./models/elo";
import { expectedGoals, fitDixonColes, type DcMatch, type DcParams } from "./models/dixon-coles";
import { confidenceScore, fairOdds, marketsFromMatrix, scorelineMatrix } from "./models/poisson";

const MODEL_NAME = "dixon-coles-elo";
const ROLLING_WINDOW = 6;
const ELO_LAMBDA_WEIGHT = 0.15;
/** Maximum number of finished matches used to fit the model. */
const TRAINING_LIMIT = 8000;

export interface AnalyticsSummary {
  runId: string;
  modelVersionId: string;
  status: "success" | "failed";
  trainingSamples: number;
  matchesScored: number;
  durationMs: number;
  error?: string;
}

export interface BacktestSummary {
  backtestId: string;
  status: "success" | "failed";
  samples: number;
  accuracy: number;
  logLoss: number;
  brier: number;
  durationMs: number;
  error?: string;
}

interface FinishedMatch {
  id: string;
  league_id: string | null;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  home_score: number;
  away_score: number;
}

interface UpcomingMatch {
  id: string;
  league_id: string | null;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
}

/**
 * Loads finished matches for training. PostgREST caps a single response at
 * 1000 rows, so we page through the archive (newest TRAINING_LIMIT matches)
 * and return them oldest-first for the sequential Elo / form walk.
 */
async function loadFinished(limit = TRAINING_LIMIT): Promise<FinishedMatch[]> {
  const page = 1000;
  const rows: FinishedMatch[] = [];

  for (let offset = 0; offset < limit; offset += page) {
    const { data } = await supabaseAdmin
      .from("matches")
      .select("id, league_id, home_team_id, away_team_id, kickoff_at, home_score, away_score")
      .eq("status", "FINISHED")
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .order("kickoff_at", { ascending: false })
      .range(offset, Math.min(offset + page, limit) - 1);

    const batch = data ?? [];
    for (const row of batch) {
      if (row.home_score === null || row.away_score === null) continue;
      rows.push({
        id: row.id,
        league_id: row.league_id,
        home_team_id: row.home_team_id,
        away_team_id: row.away_team_id,
        kickoff_at: row.kickoff_at,
        home_score: row.home_score as number,
        away_score: row.away_score as number,
      });
    }
    if (batch.length < page) break;
  }

  return rows.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));

}

interface TeamState {
  elo: number;
  matches: number;
  lastKickoff: string | null;
  leagueId: string | null;
  results: Array<{ goalsFor: number; goalsAgainst: number; points: number }>;
}

function emptyState(): TeamState {
  return { elo: ELO_CONFIG.base, matches: 0, lastKickoff: null, leagueId: null, results: [] };
}

function buildStates(matches: FinishedMatch[]): Map<string, TeamState> {
  const states = new Map<string, TeamState>();
  const get = (id: string): TeamState => {
    let state = states.get(id);
    if (!state) {
      state = emptyState();
      states.set(id, state);
    }
    return state;
  };

  for (const match of matches) {
    const home = get(match.home_team_id);
    const away = get(match.away_team_id);
    const kickoff = new Date(match.kickoff_at).getTime();

    for (const state of [home, away]) {
      if (state.lastKickoff) {
        const gapDays = (kickoff - new Date(state.lastKickoff).getTime()) / 86_400_000;
        if (gapDays > 60) state.elo = regressToMean(state.elo);
      }
    }

    const next = updateElo(home.elo, away.elo, match.home_score, match.away_score);
    home.elo = next.home;
    away.elo = next.away;

    const homePoints = match.home_score > match.away_score ? 3 : match.home_score === match.away_score ? 1 : 0;
    home.results.push({ goalsFor: match.home_score, goalsAgainst: match.away_score, points: homePoints });
    away.results.push({
      goalsFor: match.away_score,
      goalsAgainst: match.home_score,
      points: homePoints === 3 ? 0 : homePoints === 1 ? 1 : 3,
    });
    if (home.results.length > 20) home.results.shift();
    if (away.results.length > 20) away.results.shift();

    home.matches += 1;
    away.matches += 1;
    home.lastKickoff = match.kickoff_at;
    away.lastKickoff = match.kickoff_at;
    home.leagueId = match.league_id;
    away.leagueId = match.league_id;
  }

  return states;
}

function rolling(state: TeamState | undefined, window = ROLLING_WINDOW) {
  const recent = (state?.results ?? []).slice(-window);
  if (recent.length === 0) {
    return { goalsFor: 1.3, goalsAgainst: 1.3, points: 1.3, sample: 0 };
  }
  const sum = recent.reduce(
    (acc, item) => ({
      goalsFor: acc.goalsFor + item.goalsFor,
      goalsAgainst: acc.goalsAgainst + item.goalsAgainst,
      points: acc.points + item.points,
    }),
    { goalsFor: 0, goalsAgainst: 0, points: 0 },
  );
  return {
    goalsFor: sum.goalsFor / recent.length,
    goalsAgainst: sum.goalsAgainst / recent.length,
    points: sum.points / recent.length,
    sample: recent.length,
  };
}

function toDcMatches(matches: FinishedMatch[], reference: number): DcMatch[] {
  return matches.map((match) => ({
    homeTeamId: match.home_team_id,
    awayTeamId: match.away_team_id,
    homeGoals: match.home_score,
    awayGoals: match.away_score,
    ageDays: Math.max(0, (reference - new Date(match.kickoff_at).getTime()) / 86_400_000),
  }));
}

function blendedLambdas(
  params: DcParams,
  homeTeamId: string,
  awayTeamId: string,
  eloDiff: number,
): { lambdaHome: number; lambdaAway: number } {
  const base = expectedGoals(params, homeTeamId, awayTeamId);
  const adj = Math.exp((ELO_LAMBDA_WEIGHT * eloDiff) / 400);
  return {
    lambdaHome: Math.min(Math.max(base.lambdaHome * adj, 0.08), 6),
    lambdaAway: Math.min(Math.max(base.lambdaAway / adj, 0.08), 6),
  };
}

/**
 * Fits Elo + Dixon-Coles on all finished matches, stores a new immutable model version,
 * refreshes team ratings and writes fresh predictions for upcoming fixtures.
 */
export async function runAnalytics(
  options: { triggeredBy?: string; horizonDays?: number } = {},
): Promise<AnalyticsSummary> {
  const triggeredBy = options.triggeredBy ?? "manual";
  const horizonDays = options.horizonDays ?? 10;
  const startedAt = Date.now();

  const { data: run } = await supabaseAdmin
    .from("model_training_runs")
    .insert({ status: "running", triggered_by: triggeredBy })
    .select("id")
    .single();
  const runId = run?.id ?? "";

  const finish = async (
    patch: Database["public"]["Tables"]["model_training_runs"]["Update"],
  ) => {
    if (!runId) return;
    await supabaseAdmin.from("model_training_runs").update(patch).eq("id", runId);
  };

  try {
    const finished = await loadFinished();
    if (finished.length < 30) {
      throw new Error(
        `Not enough finished matches to train (${finished.length}). Run the historical sync first.`,
      );
    }

    const now = new Date();
    const states = buildStates(finished);
    const dcMatches = toDcMatches(finished, now.getTime());
    const params = fitDixonColes(dcMatches);

    // ---- model version -------------------------------------------------
    const { data: latest } = await supabaseAdmin
      .from("model_versions")
      .select("version")
      .eq("name", MODEL_NAME)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = (latest?.version ?? 0) + 1;

    await supabaseAdmin.from("model_versions").update({ is_active: false }).eq("name", MODEL_NAME);

    const { data: modelVersion } = await supabaseAdmin
      .from("model_versions")
      .insert({
        name: MODEL_NAME,
        kind: "dixon-coles+elo",
        version,
        training_samples: finished.length,
        params: {
          xi: params.xi,
          rho: params.rho,
          intercept: params.intercept,
          homeAdvantage: params.homeAdvantage,
          elo: ELO_CONFIG,
          eloLambdaWeight: ELO_LAMBDA_WEIGHT,
          rollingWindow: ROLLING_WINDOW,
          attack: params.attack,
          defence: params.defence,
        },
        metrics: { logLikelihood: params.logLikelihood, teams: Object.keys(params.attack).length },
        is_active: true,
      })
      .select("id")
      .single();

    if (!modelVersion) throw new Error("Could not persist model version");

    // ---- team ratings ---------------------------------------------------
    const asOf = now.toISOString();
    const ratingRows = [...states.entries()].map(([teamId, state]) => ({
      team_id: teamId,
      league_id: state.leagueId,
      rating: Number(state.elo.toFixed(2)),
      attack: Number((params.attack[teamId] ?? 0).toFixed(4)),
      defence: Number((params.defence[teamId] ?? 0).toFixed(4)),
      matches_played: state.matches,
      as_of: asOf,
    }));
    for (let i = 0; i < ratingRows.length; i += 200) {
      await supabaseAdmin
        .from("team_ratings")
        .upsert(ratingRows.slice(i, i + 200), { onConflict: "team_id,as_of" });
    }

    // ---- predictions for upcoming fixtures ------------------------------
    const to = new Date(now.getTime() + horizonDays * 86_400_000).toISOString();
    const { data: upcomingRaw } = await supabaseAdmin
      .from("matches")
      .select("id, league_id, home_team_id, away_team_id, kickoff_at")
      .in("status", ["SCHEDULED", "PAUSED", "LIVE"])
      .gte("kickoff_at", now.toISOString())
      .lte("kickoff_at", to)
      .order("kickoff_at", { ascending: true })
      .limit(500);

    const upcoming = (upcomingRaw ?? []) as UpcomingMatch[];
    const scored = await scoreMatches(upcoming, states, params, modelVersion.id);


    const durationMs = Date.now() - startedAt;
    await finish({
      status: "success",
      model_version_id: modelVersion.id,
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      samples: finished.length,
      matches_scored: scored,
      metrics: { logLikelihood: params.logLikelihood, rho: params.rho },
    });

    return {
      runId,
      modelVersionId: modelVersion.id,
      status: "success",
      trainingSamples: finished.length,
      matchesScored: scored,
      durationMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish({
      status: "failed",
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      error: message.slice(0, 500),
    });
    return {
      runId,
      modelVersionId: "",
      status: "failed",
      trainingSamples: 0,
      matchesScored: 0,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

/**
 * Walk-forward backtest: the model is refitted on past matches only and used to
 * predict the next block, so no future information leaks into any prediction.
 */
export async function runBacktest(
  options: { triggeredBy?: string; blockSize?: number; minTrain?: number } = {},
): Promise<BacktestSummary> {
  const triggeredBy = options.triggeredBy ?? "manual";
  const blockSize = options.blockSize ?? 40;
  const minTrain = options.minTrain ?? 200;
  const startedAt = Date.now();

  const { data: backtest } = await supabaseAdmin
    .from("backtests")
    .insert({ status: "running", triggered_by: triggeredBy })
    .select("id")
    .single();
  const backtestId = backtest?.id ?? "";

  try {
    const finished = await loadFinished();
    if (finished.length < minTrain + blockSize) {
      throw new Error(
        `Need at least ${minTrain + blockSize} finished matches to backtest (have ${finished.length}).`,
      );
    }

    const { data: activeModel } = await supabaseAdmin
      .from("model_versions")
      .select("id")
      .eq("name", MODEL_NAME)
      .eq("is_active", true)
      .maybeSingle();

    const results: Array<{
      match_id: string;
      kickoff_at: string;
      p_home: number;
      p_draw: number;
      p_away: number;
      actual: string;
      predicted: string;
      correct: boolean;
      log_loss: number;
      brier: number;
    }> = [];

    for (let start = minTrain; start < finished.length; start += blockSize) {
      const train = finished.slice(0, start);
      const test = finished.slice(start, start + blockSize);
      const reference = new Date(test[0]!.kickoff_at).getTime();
      const params = fitDixonColes(toDcMatches(train, reference), { iterations: 250 });
      const states = buildStates(train);

      for (const match of test) {
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

        const actual =
          match.home_score > match.away_score
            ? "HOME"
            : match.home_score === match.away_score
              ? "DRAW"
              : "AWAY";
        const probs: Record<string, number> = {
          HOME: markets.home,
          DRAW: markets.draw,
          AWAY: markets.away,
        };
        const predicted = (Object.entries(probs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "HOME");
        const pActual = Math.max(probs[actual] ?? 1e-9, 1e-9);
        const brier =
          (["HOME", "DRAW", "AWAY"] as const).reduce(
            (acc, key) => acc + Math.pow((probs[key] ?? 0) - (key === actual ? 1 : 0), 2),
            0,
          ) / 3;

        results.push({
          match_id: match.id,
          kickoff_at: match.kickoff_at,
          p_home: Number(markets.home.toFixed(5)),
          p_draw: Number(markets.draw.toFixed(5)),
          p_away: Number(markets.away.toFixed(5)),
          actual,
          predicted,
          correct: predicted === actual,
          log_loss: Number((-Math.log(pActual)).toFixed(5)),
          brier: Number(brier.toFixed(5)),
        });
      }
    }

    const samples = results.length;
    const accuracy = results.filter((r) => r.correct).length / Math.max(samples, 1);
    const logLoss = results.reduce((acc, r) => acc + r.log_loss, 0) / Math.max(samples, 1);
    const brier = results.reduce((acc, r) => acc + r.brier, 0) / Math.max(samples, 1);

    // calibration curve over the favourite's probability
    const bins = Array.from({ length: 10 }, (_, i) => ({
      bucket: `${i * 10}-${i * 10 + 10}%`,
      predicted: 0,
      observed: 0,
      count: 0,
    }));
    for (const r of results) {
      const p = Math.max(r.p_home, r.p_draw, r.p_away);
      const bin = bins[Math.min(9, Math.floor(p * 10))]!;
      bin.count += 1;
      bin.predicted += p;
      bin.observed += r.correct ? 1 : 0;
    }
    const calibration = bins
      .filter((bin) => bin.count > 0)
      .map((bin) => ({
        bucket: bin.bucket,
        count: bin.count,
        predicted: Number((bin.predicted / bin.count).toFixed(4)),
        observed: Number((bin.observed / bin.count).toFixed(4)),
      }));

    for (let i = 0; i < results.length; i += 200) {
      await supabaseAdmin
        .from("backtest_results")
        .insert(results.slice(i, i + 200).map((row) => ({ ...row, backtest_id: backtestId })));
    }

    const durationMs = Date.now() - startedAt;
    await supabaseAdmin
      .from("backtests")
      .update({
        status: "success",
        model_version_id: activeModel?.id ?? null,
        window_from: finished[minTrain]?.kickoff_at.slice(0, 10) ?? null,
        window_to: finished[finished.length - 1]?.kickoff_at.slice(0, 10) ?? null,
        samples,
        accuracy: Number(accuracy.toFixed(4)),
        log_loss: Number(logLoss.toFixed(4)),
        brier: Number(brier.toFixed(4)),
        calibration,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("id", backtestId);

    return { backtestId, status: "success", samples, accuracy, logLoss, brier, durationMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin
      .from("backtests")
      .update({
        status: "failed",
        error: message.slice(0, 500),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      })
      .eq("id", backtestId);
    return {
      backtestId,
      status: "failed",
      samples: 0,
      accuracy: 0,
      logLoss: 0,
      brier: 0,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}

export { MODEL_NAME, expectedScore };


/**
 * Writes features, predictions, markets and explanations for a set of fixtures
 * using an already fitted model. Shared by full training runs and by the live
 * re-scoring pass that runs whenever new fixtures arrive.
 */
async function scoreMatches(
  upcoming: UpcomingMatch[],
  states: Map<string, TeamState>,
  params: DcParams,
  modelVersionId: string,
): Promise<number> {
  let scored = 0;

    for (const match of upcoming) {
      const homeState = states.get(match.home_team_id);
      const awayState = states.get(match.away_team_id);
      const homeElo = homeState?.elo ?? ELO_CONFIG.base;
      const awayElo = awayState?.elo ?? ELO_CONFIG.base;
      const eloDiff = homeElo + ELO_CONFIG.homeAdvantage - awayElo;

      const homeRoll = rolling(homeState);
      const awayRoll = rolling(awayState);
      const kickoffMs = new Date(match.kickoff_at).getTime();
      const restHome = homeState?.lastKickoff
        ? (kickoffMs - new Date(homeState.lastKickoff).getTime()) / 86_400_000
        : null;
      const restAway = awayState?.lastKickoff
        ? (kickoffMs - new Date(awayState.lastKickoff).getTime()) / 86_400_000
        : null;

      const { lambdaHome, lambdaAway } = blendedLambdas(
        params,
        match.home_team_id,
        match.away_team_id,
        eloDiff,
      );
      const markets = marketsFromMatrix(scorelineMatrix(lambdaHome, lambdaAway, params.rho));
      const featureTimestamp = new Date().toISOString();

      const { data: feature } = await supabaseAdmin
        .from("match_features")
        .insert({
          match_id: match.id,
          feature_timestamp: featureTimestamp,
          home_elo: Number(homeElo.toFixed(2)),
          away_elo: Number(awayElo.toFixed(2)),
          elo_diff: Number(eloDiff.toFixed(2)),
          home_attack: Number((params.attack[match.home_team_id] ?? 0).toFixed(4)),
          away_attack: Number((params.attack[match.away_team_id] ?? 0).toFixed(4)),
          home_defence: Number((params.defence[match.home_team_id] ?? 0).toFixed(4)),
          away_defence: Number((params.defence[match.away_team_id] ?? 0).toFixed(4)),
          home_goals_for_avg: Number(homeRoll.goalsFor.toFixed(3)),
          home_goals_against_avg: Number(homeRoll.goalsAgainst.toFixed(3)),
          away_goals_for_avg: Number(awayRoll.goalsFor.toFixed(3)),
          away_goals_against_avg: Number(awayRoll.goalsAgainst.toFixed(3)),
          home_xg_rolling: Number(lambdaHome.toFixed(3)),
          away_xg_rolling: Number(lambdaAway.toFixed(3)),
          home_form_points: Number(homeRoll.points.toFixed(3)),
          away_form_points: Number(awayRoll.points.toFixed(3)),
          home_rest_days: restHome === null ? null : Number(restHome.toFixed(2)),
          away_rest_days: restAway === null ? null : Number(restAway.toFixed(2)),
          sample_size: Math.min(homeRoll.sample, awayRoll.sample),
          payload: { rollingWindow: ROLLING_WINDOW },
        })
        .select("id")
        .single();

      const confidence = confidenceScore([markets.home, markets.draw, markets.away]);

      const { data: prediction } = await supabaseAdmin
        .from("predictions")
        .insert({
          match_id: match.id,
          model_version_id: modelVersionId,
          feature_id: feature?.id ?? null,
          prediction_timestamp: featureTimestamp,
          p_home: Number(markets.home.toFixed(5)),
          p_draw: Number(markets.draw.toFixed(5)),
          p_away: Number(markets.away.toFixed(5)),
          lambda_home: Number(lambdaHome.toFixed(4)),
          lambda_away: Number(lambdaAway.toFixed(4)),
          expected_goals: Number((lambdaHome + lambdaAway).toFixed(4)),
          p_over_25: Number(markets.over25.toFixed(5)),
          p_under_25: Number(markets.under25.toFixed(5)),
          p_btts: Number(markets.btts.toFixed(5)),
          confidence: Number(confidence.toFixed(4)),
          top_scoreline: `${markets.topScoreline.home}-${markets.topScoreline.away}`,
        })
        .select("id")
        .single();

      if (!prediction) continue;

      const marketRows: Array<{ market: string; selection: string; probability: number }> = [
        { market: "1X2", selection: "HOME", probability: markets.home },
        { market: "1X2", selection: "DRAW", probability: markets.draw },
        { market: "1X2", selection: "AWAY", probability: markets.away },
        { market: "OU15", selection: "OVER", probability: markets.over15 },
        { market: "OU15", selection: "UNDER", probability: markets.under15 },
        { market: "OU25", selection: "OVER", probability: markets.over25 },
        { market: "OU25", selection: "UNDER", probability: markets.under25 },
        { market: "OU35", selection: "OVER", probability: markets.over35 },
        { market: "OU35", selection: "UNDER", probability: markets.under35 },
        { market: "BTTS", selection: "YES", probability: markets.btts },
        { market: "BTTS", selection: "NO", probability: markets.noBtts },
      ];

      await supabaseAdmin.from("prediction_markets").insert(
        marketRows.map((row) => ({
          prediction_id: prediction.id,
          market: row.market,
          selection: row.selection,
          probability: Number(row.probability.toFixed(5)),
          fair_odds: fairOdds(row.probability),
        })),
      );

      const explanations = [
        {
          feature: "elo_diff",
          label: "Elo edge (incl. home advantage)",
          value: eloDiff,
          contribution: eloDiff / 400,
        },
        {
          feature: "attack_strength",
          label: "Attack strength differential",
          value: (params.attack[match.home_team_id] ?? 0) - (params.attack[match.away_team_id] ?? 0),
          contribution: (params.attack[match.home_team_id] ?? 0) - (params.attack[match.away_team_id] ?? 0),
        },
        {
          feature: "defence_strength",
          label: "Defensive solidity differential",
          value: (params.defence[match.away_team_id] ?? 0) - (params.defence[match.home_team_id] ?? 0),
          contribution:
            (params.defence[match.away_team_id] ?? 0) - (params.defence[match.home_team_id] ?? 0),
        },
        {
          feature: "form_points",
          label: `Form (last ${ROLLING_WINDOW} pts/game)`,
          value: homeRoll.points - awayRoll.points,
          contribution: (homeRoll.points - awayRoll.points) / 3,
        },
        {
          feature: "rolling_goals",
          label: `Rolling goals scored (last ${ROLLING_WINDOW})`,
          value: homeRoll.goalsFor - awayRoll.goalsFor,
          contribution: (homeRoll.goalsFor - awayRoll.goalsFor) / 3,
        },
        {
          feature: "rest_days",
          label: "Rest advantage (days)",
          value: (restHome ?? 7) - (restAway ?? 7),
          contribution: ((restHome ?? 7) - (restAway ?? 7)) / 20,
        },
        {
          feature: "home_advantage",
          label: "Model home advantage",
          value: params.homeAdvantage,
          contribution: params.homeAdvantage,
        },
      ];

      const ranked = explanations
        .map((item) => ({ ...item, magnitude: Math.abs(item.contribution) }))
        .sort((a, b) => b.magnitude - a.magnitude)
        .slice(0, 6);

      await supabaseAdmin.from("prediction_explanations").insert(
        ranked.map((item, index) => ({
          prediction_id: prediction.id,
          feature: item.feature,
          label: item.label,
          value: Number(item.value.toFixed(4)),
          contribution: Number(item.contribution.toFixed(4)),
          direction: item.contribution >= 0 ? "home" : "away",
          rank: index + 1,
        })),
      );

      scored += 1;
    }

  return scored;
}

export interface LiveScoringSummary {
  status: "success" | "skipped" | "failed";
  scored: number;
  modelVersionId: string | null;
  durationMs: number;
  reason?: string;
}

/**
 * Live re-scoring: uses the currently active model version (no refit) to write
 * fresh immutable predictions for fixtures that arrived or changed since the
 * last training run. Cheap enough to run on every fixture ingest.
 */
export async function runLivePredictions(
  options: { matchIds?: string[]; horizonDays?: number; onlyUnscored?: boolean } = {},
): Promise<LiveScoringSummary> {
  const startedAt = Date.now();
  const horizonDays = options.horizonDays ?? 10;

  const { data: model } = await supabaseAdmin
    .from("model_versions")
    .select("id, params")
    .eq("name", MODEL_NAME)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const stored = (model?.params ?? null) as
    | (Partial<DcParams> & { attack?: Record<string, number>; defence?: Record<string, number> })
    | null;

  if (!model || !stored?.attack || !stored?.defence) {
    return {
      status: "skipped",
      scored: 0,
      modelVersionId: model?.id ?? null,
      durationMs: Date.now() - startedAt,
      reason: "no active model with stored strengths — run a full training first",
    };
  }

  const params: DcParams = {
    attack: stored.attack,
    defence: stored.defence,
    intercept: stored.intercept ?? 0,
    homeAdvantage: stored.homeAdvantage ?? 0.25,
    rho: stored.rho ?? 0,
    xi: stored.xi ?? 0,
    logLikelihood: stored.logLikelihood ?? 0,
    samples: stored.samples ?? 0,
  };

  const now = new Date();
  const to = new Date(now.getTime() + horizonDays * 86_400_000).toISOString();

  let query = supabaseAdmin
    .from("matches")
    .select("id, league_id, home_team_id, away_team_id, kickoff_at")
    .in("status", ["SCHEDULED", "PAUSED", "LIVE"])
    .gte("kickoff_at", now.toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(500);

  query = options.matchIds?.length
    ? query.in("id", options.matchIds.slice(0, 500))
    : query.lte("kickoff_at", to);

  const { data: candidatesRaw } = await query;
  let candidates = (candidatesRaw ?? []) as UpcomingMatch[];

  if (options.onlyUnscored !== false && candidates.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from("predictions")
      .select("match_id")
      .in("match_id", candidates.map((match) => match.id));
    const scoredIds = new Set((existing ?? []).map((row) => row.match_id));
    candidates = candidates.filter((match) => !scoredIds.has(match.id));
  }

  if (candidates.length === 0) {
    return { status: "success", scored: 0, modelVersionId: model.id, durationMs: Date.now() - startedAt };
  }

  const finished = await loadFinished();
  const states = buildStates(finished);
  const scored = await scoreMatches(candidates, states, params, model.id);

  return { status: "success", scored, modelVersionId: model.id, durationMs: Date.now() - startedAt };
}
