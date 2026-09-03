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
import { FootballDataProvider, type MatchSheet } from "./providers/football-data.server";
import { confidenceScore, fairOdds, marketsFromMatrix, scorelineMatrix } from "./models/poisson";
import { positionGroup } from "./models/intel";
import { namesMatch, slugify } from "./providers/normalize";

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

interface ImminentMatch {
  id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  status: string;
  home: { name: string } | null;
  away: { name: string } | null;
}

/**
 * Resolves the real team sheet for one fixture.
 *
 * Providers are tried in quality order: api-football publishes confirmed
 * starting XIs ~60 minutes before kickoff, football-data.org only exposes them
 * on paid tiers. The first provider that returns 11 named starters wins; when
 * none does, the caller keeps the projected line-up and says so in the UI.
 */
async function fetchTeamSheet(
  fdProvider: FootballDataProvider,
  match: ImminentMatch,
): Promise<{ ok: true; data: MatchSheet; source: string } | { ok: false; error: string }> {
  const errors: string[] = [];

  // 1. FotMob — free public API, no key, publishes confirmed XIs for every
  //    league we cover. Tried first because it is the only source that works
  //    on the free tier.
  try {
    const { FotmobProvider } = await import("./providers/fotmob.server");
    const fotmob = new FotmobProvider();

    const { data: fmSource } = await supabaseAdmin
      .from("match_sources")
      .select("provider_match_id")
      .eq("match_id", match.id)
      .eq("source_id", "fotmob")
      .maybeSingle();

    const fmId =
      fmSource?.provider_match_id ??
      (await fotmob.findMatchId(match.kickoff_at, match.home?.name ?? "", match.away?.name ?? ""));

    if (fmId) {
      if (!fmSource) {
        await supabaseAdmin
          .from("match_sources")
          .insert({ match_id: match.id, source_id: "fotmob", provider_match_id: fmId });
      }
      const sheet = await fotmob.getMatchSheet(fmId);
      if (sheet.ok && sheet.data.home.lineup.length >= 11) {
        return { ok: true, data: sheet.data, source: "fotmob" };
      }
      errors.push(sheet.ok ? "fotmob: team sheet not published yet" : `fotmob: ${sheet.error}`);
    } else {
      errors.push("fotmob: fixture not found");
    }
  } catch (error) {
    errors.push(`fotmob: ${error instanceof Error ? error.message : String(error)}`);
  }


  if (process.env["API_FOOTBALL_KEY"]) {
    try {
      const { ApiFootballProvider } = await import("./providers/api-football.server");
      const af = new ApiFootballProvider();

      const { data: afSource } = await supabaseAdmin
        .from("match_sources")
        .select("provider_match_id")
        .eq("match_id", match.id)
        .eq("source_id", "api_football")
        .maybeSingle();

      const fixtureId =
        afSource?.provider_match_id ??
        (await af.findFixtureId(
          match.kickoff_at,
          match.home?.name ?? "",
          match.away?.name ?? "",
        ));

      if (fixtureId) {
        const sheet = await af.getMatchSheet(fixtureId);
        if (sheet.ok && sheet.data.home.lineup.length >= 11) {
          if (!afSource) {
            await supabaseAdmin.from("match_sources").insert({
              match_id: match.id,
              source_id: "api_football",
              provider_match_id: fixtureId,
            });
          }
          return { ok: true, data: sheet.data, source: "api_football" };
        }
        errors.push(sheet.ok ? "api_football: lineups not published yet" : `api_football: ${sheet.error}`);
      } else {
        errors.push("api_football: fixture not found");
      }
    } catch (error) {
      errors.push(`api_football: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const { data: fdSource } = await supabaseAdmin
    .from("match_sources")
    .select("provider_match_id")
    .eq("match_id", match.id)
    .eq("source_id", "football_data")
    .maybeSingle();

  if (fdSource) {
    const sheet = await fdProvider.getMatchSheet(fdSource.provider_match_id);
    if (sheet.ok && sheet.data.home.lineup.length >= 11) {
      return { ok: true, data: sheet.data, source: "football_data" };
    }
    errors.push(sheet.ok ? "football_data: no team sheet on this tier" : `football_data: ${sheet.error}`);
  } else {
    errors.push("football_data: no source record");
  }

  return { ok: false, error: errors.join("; ") };
}

/**
 * Pulls the live status/score from FotMob so fixtures stop showing as
 * "SCHEDULED" long after they have actually kicked off.
 */
async function syncLiveStatus(matchId: string): Promise<void> {
  const { data: source } = await supabaseAdmin
    .from("match_sources")
    .select("provider_match_id")
    .eq("match_id", matchId)
    .eq("source_id", "fotmob")
    .maybeSingle();
  if (!source) return;

  const { FotmobProvider } = await import("./providers/fotmob.server");
  const live = await new FotmobProvider().getLiveStatus(source.provider_match_id);
  if (!live.ok) return;

  await supabaseAdmin
    .from("matches")
    .update({
      status: live.data.status,
      home_score: live.data.homeScore,
      away_score: live.data.awayScore,
      minute: live.data.minute,
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);
}

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
      await syncLiveStatus(match.id);


      const factors: Record<"home" | "away", number> = { home: 1, away: 1 };

      if (sheet.ok) {
        for (const side of ["home", "away"] as const) {
          const teamId = side === "home" ? match.home_team_id : match.away_team_id;
          const teamSheet = side === "home" ? sheet.data.home : sheet.data.away;
          if (teamSheet.lineup.length < 11) continue;

          const stored = await storeConfirmedLineup(match.id, teamId, teamSheet, sheet.source);
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
  sheet: {
    formation: string | null;
    lineup: Array<{ providerId: string; name: string; position: string | null }>;
    bench: Array<{ providerId: string; name: string; position: string | null }>;
  },
  sourceId: string,
): Promise<number> {
  const entries = [
    ...sheet.lineup.map((player) => ({ ...player, starter: true })),
    ...sheet.bench.map((player) => ({ ...player, starter: false })),
  ];

  // Providers use their own player ids, so resolve in three steps:
  // provider canonical id → squad member by normalized name → create the player.
  const canonicalIds = entries.map((player) => `player:${sourceId}:${player.providerId}`);
  const [{ data: byCanonical }, { data: squad }] = await Promise.all([
    supabaseAdmin.from("players").select("id, canonical_id").in("canonical_id", canonicalIds),
    supabaseAdmin
      .from("squad_memberships")
      .select("player_id, player:players(id, name)")
      .eq("team_id", teamId)
      .eq("is_current", true),
  ]);

  const canonicalMap = new Map((byCanonical ?? []).map((row) => [row.canonical_id, row.id]));
  const squadByName = new Map<string, string>();
  for (const row of (squad ?? []) as Array<{ player: { id: string; name: string } | null }>) {
    if (row.player) squadByName.set(slugify(row.player.name), row.player.id);
  }

  const resolved: Array<{ player: (typeof entries)[number]; playerId: string }> = [];
  for (const player of entries) {
    const canonical = `player:${sourceId}:${player.providerId}`;
    let playerId = canonicalMap.get(canonical);

    if (!playerId) {
      const slug = slugify(player.name);
      playerId =
        squadByName.get(slug) ??
        [...squadByName.entries()].find(([name]) => namesMatch(name, slug, 0.88))?.[1];
    }

    if (!playerId) {
      const { data: created } = await supabaseAdmin
        .from("players")
        .insert({
          canonical_id: canonical,
          name: player.name,
          position: player.position,
          provider_ids: { [sourceId]: player.providerId },
        })
        .select("id")
        .single();
      playerId = created?.id;
      if (playerId) {
        await supabaseAdmin
          .from("squad_memberships")
          .insert({ player_id: playerId, team_id: teamId, is_current: true });
      }
    }

    if (playerId) resolved.push({ player, playerId });
  }

  const rows = resolved.map(({ player, playerId }) => ({
    player_id: playerId,
    position: positionGroup(player.position),
    is_starter: player.starter,
    start_probability: player.starter ? 1 : 0.05,
    expected_minutes: player.starter ? 90 : BENCH_MINUTES,
  }));

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
      source_id: sourceId,
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
