/**
 * Phase 3 — player & football intelligence pipeline.
 *
 * Squads, coaches, referees and availability are ingested from the providers
 * that expose them, then combined with the Phase 2 goal model to produce
 * projected line-ups, expected minutes, corner/card markets and player props.
 *
 * All writes go through the service-role client; every run is recorded as an
 * ingestion job so the provider health page stays truthful.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FOOTBALL_DATA_COMPETITIONS, FootballDataProvider } from "./providers/football-data.server";
import { normalizeTeamName, slugify } from "./providers/normalize";
import {
  derivedTeamMarkets,
  playerProps,
  projectLineup,
  positionGroup,
  FORMATION_LABEL,
  type ProjectedPlayer,
  type SquadCandidate,
} from "./models/intel";

export interface IntelSummary {
  jobId: string;
  status: "success" | "partial" | "failed";
  processed: number;
  inserted: number;
  updated: number;
  errors: number;
  durationMs: number;
}

async function startJob(jobType: string, triggeredBy: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("ingestion_jobs")
    .insert({ job_type: jobType, status: "running", triggered_by: triggeredBy, source_id: null })
    .select("id")
    .single();
  return data?.id ?? "";
}

async function finishJob(
  jobId: string,
  startedAt: number,
  counts: { processed: number; inserted: number; updated: number; errors: number },
): Promise<IntelSummary> {
  const durationMs = Date.now() - startedAt;
  const status: IntelSummary["status"] =
    counts.errors > 0 ? (counts.processed > 0 ? "partial" : "failed") : "success";

  if (jobId) {
    await supabaseAdmin
      .from("ingestion_jobs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        records_processed: counts.processed,
        records_inserted: counts.inserted,
        records_updated: counts.updated,
        error_count: counts.errors,
      })
      .eq("id", jobId);
  }

  return { jobId, status, durationMs, ...counts };
}

async function logError(jobId: string, stage: string, message: string): Promise<void> {
  await supabaseAdmin.from("ingestion_errors").insert({
    job_id: jobId || null,
    source_id: "football_data",
    stage,
    message: message.slice(0, 500),
  });
}

/* ------------------------------------------------------------------ */
/* Squads, players and coaches                                         */
/* ------------------------------------------------------------------ */

export async function ingestSquads(
  options: { triggeredBy?: string; competitions?: string[] } = {},
): Promise<IntelSummary> {
  const startedAt = Date.now();
  const jobId = await startJob("squads", options.triggeredBy ?? "manual");
  const competitions = options.competitions ?? [...FOOTBALL_DATA_COMPETITIONS];
  const provider = new FootballDataProvider();

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  const { data: teamRows } = await supabaseAdmin.from("teams").select("id, name, provider_ids");
  const byProvider = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const team of teamRows ?? []) {
    const ids = (team.provider_ids as Record<string, string> | null) ?? {};
    const fdId = ids["football_data"];
    if (fdId) byProvider.set(fdId, team.id);
    byName.set(normalizeTeamName(team.name), team.id);
  }

  const { data: seasonRows } = await supabaseAdmin
    .from("seasons")
    .select("id, league_id, is_current")
    .eq("is_current", true);
  const { data: leagueRows } = await supabaseAdmin.from("leagues").select("id, provider_ids");
  const seasonByLeague = new Map((seasonRows ?? []).map((s) => [s.league_id, s.id]));
  const leagueByCode = new Map<string, string>();
  for (const league of leagueRows ?? []) {
    const ids = (league.provider_ids as Record<string, string> | null) ?? {};
    const code = ids["football_data"];
    if (code) leagueByCode.set(code, league.id);
  }

  for (const code of competitions) {
    const result = await provider.getSquads(code);
    if (!result.ok) {
      errors += 1;
      await logError(jobId, `squads:${code}`, result.error);
      continue;
    }

    const leagueId = leagueByCode.get(code) ?? null;
    const seasonId = leagueId ? (seasonByLeague.get(leagueId) ?? null) : null;

    for (const squad of result.data) {
      // A club can appear in several competitions (e.g. league + Champions League);
      // an empty squad list there must not wipe the squad we already have.
      if (squad.players.length === 0) continue;
      const teamId =
        byProvider.get(squad.teamProviderId) ?? byName.get(normalizeTeamName(squad.teamName));
      if (!teamId) continue;


      if (squad.coach) {
        const coachCanonical = `coach:fd:${squad.coach.providerId}`;
        const { data: coach } = await supabaseAdmin
          .from("coaches")
          .upsert(
            {
              canonical_id: coachCanonical,
              name: squad.coach.name,
              nationality: squad.coach.nationality,
              birth_date: squad.coach.birthDate,
              provider_ids: { "football_data": squad.coach.providerId },
            },
            { onConflict: "canonical_id" },
          )
          .select("id")
          .single();
        if (coach) {
          await supabaseAdmin
            .from("coach_spells")
            .update({ is_current: false })
            .eq("team_id", teamId)
            .neq("coach_id", coach.id);
          await supabaseAdmin.from("coach_spells").upsert(
            { coach_id: coach.id, team_id: teamId, is_current: true, started_at: null },
            { onConflict: "coach_id,team_id,started_at", ignoreDuplicates: true },
          );
        }
      }

      await supabaseAdmin
        .from("squad_memberships")
        .update({ is_current: false })
        .eq("team_id", teamId);

      for (const player of squad.players) {
        processed += 1;
        const canonicalId = `player:fd:${player.providerId}`;
        const { data: existing } = await supabaseAdmin
          .from("players")
          .select("id")
          .eq("canonical_id", canonicalId)
          .maybeSingle();

        const { data: row, error } = await supabaseAdmin
          .from("players")
          .upsert(
            {
              canonical_id: canonicalId,
              name: player.name,
              position: player.position,
              birth_date: player.birthDate,
              nationality: player.nationality,
              provider_ids: { "football_data": player.providerId },
            },
            { onConflict: "canonical_id" },
          )
          .select("id")
          .single();

        if (error || !row) {
          errors += 1;
          await logError(jobId, "player-upsert", error?.message ?? "unknown");
          continue;
        }
        if (existing) updated += 1;
        else inserted += 1;

        await supabaseAdmin.from("player_aliases").upsert(
          {
            player_id: row.id,
            alias: player.name,
            normalized_alias: slugify(player.name),
            source: "football_data",
          },
          { onConflict: "player_id,normalized_alias", ignoreDuplicates: true },
        );

        const membership = {
          player_id: row.id,
          team_id: teamId,
          season_id: seasonId,
          shirt_number: player.shirtNumber,
          position: player.position,
          is_current: true,
        };

        const { data: existingMembership } = await supabaseAdmin
          .from("squad_memberships")
          .select("id")
          .eq("player_id", row.id)
          .eq("team_id", teamId)
          .maybeSingle();

        if (existingMembership) {
          await supabaseAdmin
            .from("squad_memberships")
            .update(membership)
            .eq("id", existingMembership.id);
        } else {
          await supabaseAdmin.from("squad_memberships").insert(membership);
        }
      }
    }
  }

  return finishJob(jobId, startedAt, { processed, inserted, updated, errors });
}

/* ------------------------------------------------------------------ */
/* Referees                                                            */
/* ------------------------------------------------------------------ */

interface FdReferee {
  id?: number;
  name?: string;
  type?: string;
  nationality?: string | null;
}

/**
 * Referee assignments are embedded in the football-data.org match payloads we
 * already store, so this backfills officials without extra API calls.
 */
export async function ingestOfficials(
  options: { triggeredBy?: string; limit?: number } = {},
): Promise<IntelSummary> {
  const startedAt = Date.now();
  const jobId = await startJob("officials", options.triggeredBy ?? "manual");
  const limit = options.limit ?? 5000;

  let processed = 0;
  let inserted = 0;
  const updated = 0;
  let errors = 0;

  const { data: sources } = await supabaseAdmin
    .from("match_sources")
    .select("match_id, payload")
    .eq("source_id", "football_data")
    .order("ingested_at", { ascending: false })
    .limit(limit);

  const refereeCache = new Map<string, string>();

  for (const source of sources ?? []) {
    const payload = source.payload as Record<string, unknown> | null;
    const referees = (payload?.["referees"] as FdReferee[] | undefined) ?? [];
    for (const referee of referees) {
      if (!referee.id || !referee.name) continue;
      processed += 1;
      const canonicalId = `referee:fd:${referee.id}`;
      let refereeId = refereeCache.get(canonicalId);

      if (!refereeId) {
        const { data: row, error } = await supabaseAdmin
          .from("referees")
          .upsert(
            {
              canonical_id: canonicalId,
              name: referee.name,
              country: referee.nationality ?? null,
              provider_ids: { "football_data": String(referee.id) },
            },
            { onConflict: "canonical_id" },
          )
          .select("id")
          .single();
        if (error || !row) {
          errors += 1;
          continue;
        }
        refereeId = row.id;
        refereeCache.set(canonicalId, refereeId);
      }

      const role = (referee.type ?? "REFEREE").toLowerCase();
      const { error: linkError } = await supabaseAdmin.from("match_officials").upsert(
        { match_id: source.match_id, referee_id: refereeId, role },
        { onConflict: "match_id,referee_id,role", ignoreDuplicates: true },
      );
      if (linkError) errors += 1;
      else inserted += 1;
    }
  }

  return finishJob(jobId, startedAt, { processed, inserted, updated, errors });
}

/* ------------------------------------------------------------------ */
/* Match intelligence: line-ups, minutes, markets and props            */
/* ------------------------------------------------------------------ */

export async function runIntel(
  options: { triggeredBy?: string; days?: number; matchIds?: string[] } = {},
): Promise<IntelSummary> {
  const startedAt = Date.now();
  const jobId = await startJob("intel", options.triggeredBy ?? "manual");
  const days = options.days ?? 7;

  let processed = 0;
  let inserted = 0;
  const updated = 0;
  let errors = 0;

  const from = new Date();
  const to = new Date(from.getTime() + days * 86_400_000);

  const query = supabaseAdmin
    .from("matches")
    .select("id, home_team_id, away_team_id, kickoff_at");

  const { data: matches } = options.matchIds?.length
    ? await query.in("id", options.matchIds).limit(300)
    : await query
        .gte("kickoff_at", from.toISOString())
        .lte("kickoff_at", to.toISOString())
        .order("kickoff_at", { ascending: true })
        .limit(300);


  const { data: injuryRows } = await supabaseAdmin
    .from("injuries")
    .select("player_id")
    .is("resolved_at", null);
  const unavailable = new Set((injuryRows ?? []).map((row) => row.player_id));

  for (const match of matches ?? []) {
    try {
      const { data: prediction } = await supabaseAdmin
        .from("predictions")
        .select("id, lambda_home, lambda_away, model_version_id")
        .eq("match_id", match.id)
        .order("prediction_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!prediction) continue;

      const refereeCards = await refereeCardRate(match.id);
      const { expectedCards, markets } = derivedTeamMarkets({
        lambdaHome: Number(prediction.lambda_home),
        lambdaAway: Number(prediction.lambda_away),
        refereeCardsPerGame: refereeCards,
      });

      for (const market of markets) {
        await supabaseAdmin.from("prediction_markets").insert({
          prediction_id: prediction.id,
          market: market.market,
          selection: market.selection,
          probability: market.probability,
          fair_odds: market.fairOdds,
        });
      }

      const timestamp = new Date().toISOString();

      for (const side of ["home", "away"] as const) {
        const teamId = side === "home" ? match.home_team_id : match.away_team_id;
        const teamLambda = Number(
          side === "home" ? prediction.lambda_home : prediction.lambda_away,
        );

        // A confirmed team sheet (stored by the T-60 refresh) always wins over
        // the projection: props are then priced off the real XI.
        const confirmed = await confirmedProjection(match.id, teamId);
        const candidates = confirmed ? [] : await squadCandidates(teamId, unavailable);
        if (!confirmed && candidates.length < 11) continue;

        const projection = confirmed ?? projectLineup(candidates);

        if (!confirmed) {
          await supabaseAdmin
            .from("lineups")
            .delete()
            .eq("match_id", match.id)
            .eq("team_id", teamId)
            .eq("is_predicted", true);

          const { data: lineup } = await supabaseAdmin
            .from("lineups")
            .insert({
              match_id: match.id,
              team_id: teamId,
              formation: FORMATION_LABEL,
              is_predicted: true,
              confidence: 0.55,
              source_id: "football_data",
            })
            .select("id")
            .single();

          if (lineup) {
            const rows = projection.slice(0, 22).map((player) => ({
              lineup_id: lineup.id,
              player_id: player.playerId,
              position: player.group,
              is_starter: player.isStarter,
              start_probability: player.startProbability,
              expected_minutes: player.expectedMinutes,
            }));
            if (rows.length > 0) await supabaseAdmin.from("lineup_players").insert(rows);
          }
        }

        const props = playerProps({

          players: projection.filter((player) => player.expectedMinutes >= 8),
          teamLambda,
          expectedCards,
        });

        // Replace any earlier projection for this match/team so reruns don't stack up.
        await supabaseAdmin
          .from("player_prop_predictions")
          .delete()
          .eq("match_id", match.id)
          .eq("team_id", teamId);

        if (props.length > 0) {
          const { error } = await supabaseAdmin.from("player_prop_predictions").insert(
            props.map((prop) => ({
              match_id: match.id,
              player_id: prop.playerId,
              team_id: teamId,
              model_version_id: prediction.model_version_id,
              market: prop.market,
              selection: prop.selection,
              line: prop.line,
              probability: prop.probability,
              fair_odds: prop.fairOdds,
              expected_minutes: prop.expectedMinutes,
              prediction_timestamp: timestamp,
            })),
          );
          if (error) errors += 1;
          else inserted += props.length;
        }
      }

      processed += 1;
    } catch (error) {
      errors += 1;
      await logError(jobId, "intel", error instanceof Error ? error.message : String(error));
    }
  }

  return finishJob(jobId, startedAt, { processed, inserted, updated, errors });
}

async function squadCandidates(
  teamId: string,
  unavailable: Set<string>,
): Promise<SquadCandidate[]> {
  const { data: squad } = await supabaseAdmin
    .from("squad_memberships")
    .select("player_id, shirt_number, position, players(id, name, position)")
    .eq("team_id", teamId)
    .eq("is_current", true);

  return (squad ?? [])
    .map((row) => {
      const player = row.players as { id: string; name: string; position: string | null } | null;
      if (!player) return null;
      return {
        playerId: player.id,
        name: player.name,
        position: row.position ?? player.position,
        shirtNumber: row.shirt_number,
        available: !unavailable.has(player.id),
      } satisfies SquadCandidate;
    })
    .filter((row): row is SquadCandidate => row !== null);
}

/** Yellow cards per game for the appointed referee, when observed data exists. */
async function refereeCardRate(matchId: string): Promise<number | null> {
  const { data: official } = await supabaseAdmin
    .from("match_officials")
    .select("referee_id")
    .eq("match_id", matchId)
    .eq("role", "referee")
    .maybeSingle();
  if (!official) return null;

  const { data: stats } = await supabaseAdmin
    .from("referee_stats")
    .select("yellow_per_game")
    .eq("referee_id", official.referee_id)
    .not("yellow_per_game", "is", null)
    .limit(1)
    .maybeSingle();

  return stats?.yellow_per_game ? Number(stats.yellow_per_game) : null;
}

/**
 * Reads a confirmed team sheet back as a projection, so player props can be
 * priced off the real XI once the T-60 refresh has stored one.
 */
async function confirmedProjection(
  matchId: string,
  teamId: string,
): Promise<ProjectedPlayer[] | null> {
  const { data: lineup } = await supabaseAdmin
    .from("lineups")
    .select(
      "id, players:lineup_players(player_id, position, is_starter, start_probability, expected_minutes, player:players(id, name, position))",
    )
    .eq("match_id", matchId)
    .eq("team_id", teamId)
    .eq("is_predicted", false)
    .maybeSingle();

  if (!lineup || lineup.players.length < 11) return null;

  return lineup.players.map((row) => {
    const player = row.player as { id: string; name: string; position: string | null } | null;
    return {
      playerId: row.player_id,
      name: player?.name ?? "Unknown",
      group: positionGroup(row.position ?? player?.position),
      isStarter: row.is_starter,
      startProbability: Number(row.start_probability ?? (row.is_starter ? 1 : 0.05)),
      expectedMinutes: Number(row.expected_minutes ?? (row.is_starter ? 90 : 12)),
    } satisfies ProjectedPlayer;
  });
}
