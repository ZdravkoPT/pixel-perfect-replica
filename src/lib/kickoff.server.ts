/**
 * T-60 kickoff refresh.
 *
 * Shortly before kickoff we re-check every imminent fixture: pull the match
 * sheet from the provider, store the confirmed XI when the feed exposes one,
 * measure how much of the projected XI actually starts and re-score the AI
 * prediction with that availability signal. Predictions are immutable, so a
 * fresh row is written and the UI always renders the latest one.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FootballDataProvider } from "./providers/football-data.server";
import { confidenceScore, fairOdds, marketsFromMatrix, scorelineMatrix } from "./models/poisson";
import { positionGroup } from "./models/intel";

export interface KickoffSummary {
  jobId: string;
  status: "success" | "partial" | "failed";
  processed: number;
  confirmedLineups: number;
  rescored: number;
  errors: number;
  durationMs: number;
}

const BENCH_MINUTES = 12;

export async function runKickoffRefresh(
  options: { triggeredBy?: string; windowMinutes?: number } = {},
): Promise<KickoffSummary> {
  const startedAt = Date.now();
  const windowMinutes = options.windowMinutes ?? 70;

  const { data: job } = await supabaseAdmin
    .from("ingestion_jobs")
    .insert({
      job_type: "kickoff-refresh",
      status: "running",
      triggered_by: options.triggeredBy ?? "manual",
      source_id: "football_data",
    })
    .select("id")
    .single();
  const jobId = job?.id ?? "";

  let processed = 0;
  let confirmedLineups = 0;
  let rescored = 0;
  let errors = 0;

  const now = new Date();
  const until = new Date(now.getTime() + windowMinutes * 60_000);

  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select(
      "id, home_team_id, away_team_id, kickoff_at, status, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)",
    )
    .in("status", ["SCHEDULED", "LIVE", "PAUSED"])
    .gte("kickoff_at", new Date(now.getTime() - 15 * 60_000).toISOString())
    .lte("kickoff_at", until.toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(60);

  const provider = new FootballDataProvider();

  for (const match of (matches ?? []) as unknown as ImminentMatch[]) {
    try {
      processed += 1;

      const sheet = await fetchTeamSheet(provider, match);


      const factors: Record<"home" | "away", number> = { home: 1, away: 1 };

      if (sheet.ok) {
        for (const side of ["home", "away"] as const) {
          const teamId = side === "home" ? match.home_team_id : match.away_team_id;
          const teamSheet = side === "home" ? sheet.data.home : sheet.data.away;
          if (teamSheet.lineup.length < 11) continue;

          const stored = await storeConfirmedLineup(match.id, teamId, teamSheet);
          if (stored === 0) continue;
          confirmedLineups += 1;
          factors[side] = await availabilityFactor(match.id, teamId);
        }
      }

      const changed = await rescorePrediction(match.id, factors.home, factors.away, sheet.ok);
      if (changed) rescored += 1;
    } catch (error) {
      errors += 1;
      await supabaseAdmin.from("ingestion_errors").insert({
        job_id: jobId || null,
        source_id: "football_data",
        stage: "kickoff-refresh",
        message: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      });
    }
  }

  // Refresh player props / derived markets against the newest predictions.
  if (processed > 0) {
    const { runIntel } = await import("./intel.server");
    await runIntel({
      triggeredBy: options.triggeredBy ?? "manual",
      matchIds: (matches ?? []).map((match) => match.id),
    });
  }

  const durationMs = Date.now() - startedAt;
  const status: KickoffSummary["status"] =
    errors > 0 ? (processed > errors ? "partial" : "failed") : "success";

  if (jobId) {
    await supabaseAdmin
      .from("ingestion_jobs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        records_processed: processed,
        records_inserted: confirmedLineups,
        records_updated: rescored,
        error_count: errors,
      })
      .eq("id", jobId);
  }

  return { jobId, status, processed, confirmedLineups, rescored, errors, durationMs };
}

/** Persists the confirmed starting XI + bench. Returns rows written. */
async function storeConfirmedLineup(
  matchId: string,
  teamId: string,
  sheet: { formation: string | null; lineup: Array<{ providerId: string; position: string | null }>; bench: Array<{ providerId: string; position: string | null }> },
): Promise<number> {
  const providerIds = [...sheet.lineup, ...sheet.bench].map((player) => player.providerId);
  const { data: players } = await supabaseAdmin
    .from("players")
    .select("id, canonical_id")
    .in(
      "canonical_id",
      providerIds.map((id) => `player:fd:${id}`),
    );

  const byProvider = new Map(
    (players ?? []).map((player) => [player.canonical_id.replace("player:fd:", ""), player.id]),
  );

  const rows = [
    ...sheet.lineup.map((player) => ({ ...player, starter: true })),
    ...sheet.bench.map((player) => ({ ...player, starter: false })),
  ]
    .map((player) => {
      const playerId = byProvider.get(player.providerId);
      if (!playerId) return null;
      return {
        player_id: playerId,
        position: positionGroup(player.position),
        is_starter: player.starter,
        start_probability: player.starter ? 1 : 0.05,
        expected_minutes: player.starter ? 90 : BENCH_MINUTES,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.filter((row) => row.is_starter).length < 11) return 0;

  await supabaseAdmin
    .from("lineups")
    .delete()
    .eq("match_id", matchId)
    .eq("team_id", teamId)
    .eq("is_predicted", false);

  const { data: lineup } = await supabaseAdmin
    .from("lineups")
    .insert({
      match_id: matchId,
      team_id: teamId,
      formation: sheet.formation,
      is_predicted: false,
      confidence: 1,
      source_id: "football_data",
    })
    .select("id")
    .single();

  if (!lineup) return 0;
  await supabaseAdmin
    .from("lineup_players")
    .insert(rows.map((row) => ({ ...row, lineup_id: lineup.id })));
  return rows.length;
}

/**
 * How much of the projected XI actually starts, weighted by projected minutes.
 * 1 = the model's expected XI started, lower = key players are missing.
 */
async function availabilityFactor(matchId: string, teamId: string): Promise<number> {
  const { data: lineups } = await supabaseAdmin
    .from("lineups")
    .select("id, is_predicted, players:lineup_players(player_id, is_starter, expected_minutes)")
    .eq("match_id", matchId)
    .eq("team_id", teamId);

  const projected = (lineups ?? []).find((row) => row.is_predicted);
  const confirmed = (lineups ?? []).find((row) => !row.is_predicted);
  if (!projected || !confirmed) return 1;

  const confirmedStarters = new Set(
    confirmed.players.filter((row) => row.is_starter).map((row) => row.player_id),
  );
  const projectedStarters = projected.players.filter((row) => row.is_starter);
  if (projectedStarters.length === 0) return 1;

  const total = projectedStarters.reduce((sum, row) => sum + Number(row.expected_minutes ?? 90), 0);
  const present = projectedStarters
    .filter((row) => confirmedStarters.has(row.player_id))
    .reduce((sum, row) => sum + Number(row.expected_minutes ?? 90), 0);

  const share = total > 0 ? present / total : 1;
  // Keep the adjustment conservative: a fully changed XI moves goal expectancy ~15%.
  return Number((0.85 + 0.15 * share).toFixed(4));
}

/** Writes a fresh prediction row adjusted for the confirmed line-ups. */
async function rescorePrediction(
  matchId: string,
  homeFactor: number,
  awayFactor: number,
  sheetAvailable: boolean,
): Promise<boolean> {
  const { data: previous } = await supabaseAdmin
    .from("predictions")
    .select("id, model_version_id, feature_id, lambda_home, lambda_away, prediction_timestamp")
    .eq("match_id", matchId)
    .order("prediction_timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!previous) return false;

  // Nothing new to say: no sheet and no availability change.
  const unchanged = homeFactor === 1 && awayFactor === 1;
  const ageMinutes = (Date.now() - new Date(previous.prediction_timestamp).getTime()) / 60_000;
  if (unchanged && (!sheetAvailable || ageMinutes < 55)) return false;

  const { data: model } = await supabaseAdmin
    .from("model_versions")
    .select("id, params")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rho = Number((model?.params as Record<string, unknown> | null)?.["rho"] ?? 0);
  const lambdaHome = Math.min(Math.max(Number(previous.lambda_home) * homeFactor, 0.08), 6);
  const lambdaAway = Math.min(Math.max(Number(previous.lambda_away) * awayFactor, 0.08), 6);
  const markets = marketsFromMatrix(scorelineMatrix(lambdaHome, lambdaAway, rho));
  const timestamp = new Date().toISOString();

  const { data: prediction } = await supabaseAdmin
    .from("predictions")
    .insert({
      match_id: matchId,
      model_version_id: model?.id ?? previous.model_version_id,
      feature_id: previous.feature_id,
      prediction_timestamp: timestamp,
      p_home: Number(markets.home.toFixed(5)),
      p_draw: Number(markets.draw.toFixed(5)),
      p_away: Number(markets.away.toFixed(5)),
      lambda_home: Number(lambdaHome.toFixed(4)),
      lambda_away: Number(lambdaAway.toFixed(4)),
      expected_goals: Number((lambdaHome + lambdaAway).toFixed(4)),
      p_over_25: Number(markets.over25.toFixed(5)),
      p_under_25: Number(markets.under25.toFixed(5)),
      p_btts: Number(markets.btts.toFixed(5)),
      confidence: Number(confidenceScore([markets.home, markets.draw, markets.away]).toFixed(4)),
      top_scoreline: `${markets.topScoreline.home}-${markets.topScoreline.away}`,
    })
    .select("id")
    .single();

  if (!prediction) return false;

  const rows: Array<{ market: string; selection: string; probability: number }> = [
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
    rows.map((row) => ({
      prediction_id: prediction.id,
      market: row.market,
      selection: row.selection,
      probability: Number(row.probability.toFixed(5)),
      fair_odds: fairOdds(row.probability),
    })),
  );

  await supabaseAdmin.from("prediction_explanations").insert([
    {
      prediction_id: prediction.id,
      feature: "kickoff_refresh",
      label: sheetAvailable
        ? "Team-sheet check at T-60"
        : "Pre-kickoff refresh (no team sheet published)",
      value: 1,
      contribution: Number((homeFactor - awayFactor).toFixed(4)),
      direction: homeFactor >= awayFactor ? "home" : "away",
      rank: 1,
    },
    {
      prediction_id: prediction.id,
      feature: "lineup_availability",
      label: "Confirmed XI vs projected XI strength",
      value: Number(((homeFactor + awayFactor) / 2).toFixed(4)),
      contribution: Number((homeFactor - awayFactor).toFixed(4)),
      direction: homeFactor >= awayFactor ? "home" : "away",
      rank: 2,
    },
  ]);

  return true;
}
