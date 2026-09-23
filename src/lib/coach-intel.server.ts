/**
 * Coach dossiers and player condition.
 *
 * Both come from FotMob's free public endpoints:
 *  - coach profile: managerial spells (head coach *and* assistant roles), the
 *    playing career before them, per-club win/draw/loss records and trophies;
 *  - player condition: the last appearances with minutes and ratings, from
 *    which recent load, sharpness and availability are derived.
 *
 * Nothing is invented — derived numbers are only computed from published
 * minutes and ratings, and missing inputs stay null.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FotmobProvider } from "./providers/fotmob.server";
import { normalizeTeamName, namesMatch } from "./providers/normalize";

export interface CoachProfileSummary {
  status: "success" | "partial" | "failed";
  coaches: number;
  errors: number;
  durationMs: number;
}

/** Refreshes coach dossiers for every club we hold with a FotMob id. */
export async function ingestCoachProfiles(
  options: { maxTeams?: number; triggeredBy?: string } = {},
): Promise<CoachProfileSummary> {
  const startedAt = Date.now();
  const provider = new FotmobProvider();
  const staleBefore = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { data: teamRows } = await supabaseAdmin
    .from("teams")
    .select("id, name, provider_ids")
    .not("provider_ids->>fotmob", "is", null);
  const teams = (teamRows ?? []).slice(0, options.maxTeams ?? 120);

  const { data: freshRows } = await supabaseAdmin
    .from("coach_profiles")
    .select("coach_id, fetched_at");
  const fresh = new Set(
    (freshRows ?? []).filter((row) => row.fetched_at > staleBefore).map((row) => row.coach_id),
  );

  let coaches = 0;
  let errors = 0;

  for (const team of teams) {
    const fmTeamId = ((team.provider_ids ?? {}) as Record<string, string>)["fotmob"];
    if (!fmTeamId) continue;

    const listed = await provider.findTeamCoach(fmTeamId);
    if (!listed) continue;

    // Resolve the coach in our own tables: provider id, then current spell at
    // this club, then a name match.
    let coachId: string | null = null;
    const { data: byProvider } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("provider_ids->>fotmob", listed.providerId)
      .maybeSingle();
    coachId = byProvider?.id ?? null;

    if (!coachId) {
      const { data: spell } = await supabaseAdmin
        .from("coach_spells")
        .select("coach_id, coach:coaches(id, name)")
        .eq("team_id", team.id)
        .eq("is_current", true)
        .maybeSingle();
      const current = spell?.coach as { id: string; name: string } | null;
      if (current && (namesMatch(current.name, listed.name, 0.8) ||
        normalizeTeamName(current.name) === normalizeTeamName(listed.name))) {
        coachId = current.id;
      }
    }

    if (!coachId) {
      const { data: created, error } = await supabaseAdmin
        .from("coaches")
        .upsert(
          {
            canonical_id: `coach:fotmob:${listed.providerId}`,
            name: listed.name,
            nationality: listed.nationality,
            birth_date: listed.birthDate,
            provider_ids: { fotmob: listed.providerId },
          },
          { onConflict: "canonical_id" },
        )
        .select("id")
        .single();
      if (error || !created) {
        errors += 1;
        continue;
      }
      coachId = created.id;
      await supabaseAdmin
        .from("coach_spells")
        .upsert(
          { coach_id: coachId, team_id: team.id, is_current: true },
          { onConflict: "coach_id,team_id" },
        );
    } else {
      const { data: row } = await supabaseAdmin
        .from("coaches")
        .select("provider_ids")
        .eq("id", coachId)
        .maybeSingle();
      const ids = { ...((row?.provider_ids ?? {}) as Record<string, string>) };
      if (ids["fotmob"] !== listed.providerId) {
        ids["fotmob"] = listed.providerId;
        await supabaseAdmin.from("coaches").update({ provider_ids: ids }).eq("id", coachId);
      }
    }

    if (fresh.has(coachId)) continue;

    const profile = await provider.getCoachProfile(listed.providerId);
    if (!profile.ok) {
      errors += 1;
      continue;
    }
    const p = profile.data;

    const { error } = await supabaseAdmin.from("coach_profiles").upsert(
      {
        coach_id: coachId,
        source: "fotmob",
        provider_coach_id: listed.providerId,
        name: p.name ?? listed.name,
        nationality: p.nationality ?? listed.nationality,
        current_team_id: team.id,
        career: p.career as unknown as never,
        seasons: p.seasons as unknown as never,
        achievements: p.achievements as unknown as never,
        totals: p.totals as unknown as never,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "coach_id" },
    );
    if (error) errors += 1;
    else coaches += 1;

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return {
    status: errors > 0 ? (coaches > 0 ? "partial" : "failed") : "success",
    coaches,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

export interface ConditionSummary {
  status: "success" | "partial" | "failed";
  players: number;
  errors: number;
  durationMs: number;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Refreshes recent-load / sharpness snapshots for players whose club has a
 * fixture in the next few days (they are the ones the models and the bet
 * builder read), oldest snapshots first.
 */
export async function ingestPlayerConditions(
  options: { days?: number; maxPlayers?: number; triggeredBy?: string } = {},
): Promise<ConditionSummary> {
  const startedAt = Date.now();
  const provider = new FotmobProvider();
  const days = options.days ?? 6;
  const maxPlayers = options.maxPlayers ?? 120;
  const staleBefore = new Date(Date.now() - 2 * 86_400_000).toISOString();

  const from = new Date();
  const to = new Date(from.getTime() + days * 86_400_000);

  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("home_team_id, away_team_id")
    .gte("kickoff_at", from.toISOString())
    .lte("kickoff_at", to.toISOString())
    .limit(300);

  const teamIds = new Set<string>();
  for (const row of matches ?? []) {
    if (row.home_team_id) teamIds.add(row.home_team_id);
    if (row.away_team_id) teamIds.add(row.away_team_id);
  }
  if (teamIds.size === 0) {
    return { status: "success", players: 0, errors: 0, durationMs: Date.now() - startedAt };
  }

  const { data: memberships } = await supabaseAdmin
    .from("squad_memberships")
    .select("team_id, player:players(id, provider_ids)")
    .in("team_id", [...teamIds])
    .eq("is_current", true)
    .limit(2000);

  const { data: existing } = await supabaseAdmin
    .from("player_conditions")
    .select("player_id, fetched_at");
  const fresh = new Set(
    (existing ?? []).filter((row) => row.fetched_at > staleBefore).map((row) => row.player_id),
  );

  let players = 0;
  let errors = 0;

  for (const row of memberships ?? []) {
    if (players >= maxPlayers) break;
    const player = row.player as unknown as { id: string; provider_ids: Record<string, string> } | null;
    if (!player) continue;
    if (fresh.has(player.id)) continue;
    const fotmobId = (player.provider_ids ?? {})["fotmob"];
    if (!fotmobId) continue;

    const result = await provider.getPlayerRecentMatches(fotmobId);
    if (!result.ok) {
      errors += 1;
      continue;
    }

    const appearances = [...result.data.matches].sort((a, b) => b.date.localeCompare(a.date));
    if (appearances.length === 0) continue;

    const now = Date.now();
    const last30 = appearances.filter((row) => now - Date.parse(row.date) <= 30 * 86_400_000);
    const recent = appearances.slice(0, 5);
    const prior = appearances.slice(5, 10);

    const minutes30 = last30.reduce((sum, row) => sum + row.minutes, 0);
    const minutesRecent = recent.reduce((sum, row) => sum + row.minutes, 0);
    const ratingRecent = avg(
      recent.filter((row) => row.rating !== null).map((row) => row.rating as number),
    );
    const ratingPrior = avg(
      prior.filter((row) => row.rating !== null).map((row) => row.rating as number),
    );
    const minutesShare = recent.length > 0 ? minutesRecent / (recent.length * 90) : null;
    const lastPlayed = appearances.find((row) => row.played) ?? appearances[0]!;
    const daysSince = Math.floor((now - Date.parse(lastPlayed.date)) / 86_400_000);
    const trend = ratingRecent !== null && ratingPrior !== null ? ratingRecent - ratingPrior : null;

    const loadIndex = clamp((minutes30 / 450) * 100, 0, 150);
    const sharpness =
      minutesShare === null
        ? null
        : clamp(50 + (trend ?? 0) * 20 + (minutesShare - 0.6) * 60 - Math.max(0, daysSince - 10) * 1.5, 0, 100);

    const injury = result.data.injury ?? null;
    const availability = injury ? "injured" : minutesShare !== null && minutesShare < 0.2 ? "fringe" : "available";

    const { error } = await supabaseAdmin.from("player_conditions").upsert(
      {
        player_id: player.id,
        source: "fotmob",
        team_id: row.team_id,
        matches_30d: last30.length,
        minutes_30d: minutes30,
        matches_recent: recent.length,
        minutes_recent: minutesRecent,
        starts_recent: recent.filter((row) => row.started).length,
        avg_rating_recent: ratingRecent,
        avg_rating_prior: ratingPrior,
        rating_trend: trend,
        goals_recent: recent.reduce((sum, row) => sum + row.goals, 0),
        assists_recent: recent.reduce((sum, row) => sum + row.assists, 0),
        days_since_last_match: daysSince,
        minutes_share: minutesShare,
        load_index: loadIndex,
        sharpness,
        availability,
        injury: injury ? (injury as unknown as never) : null,
        recent_matches: appearances.slice(0, 10) as unknown as never,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "player_id" },
    );
    if (error) errors += 1;
    else players += 1;

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    status: errors > 0 ? (players > 0 ? "partial" : "failed") : "success",
    players,
    errors,
    durationMs: Date.now() - startedAt,
  };
}
