/**
 * Player skill profiles ("FIFA-style" attribute card).
 *
 * Source: FotMob's free public API. Two calls per club give us the squad with
 * season form (rating, goals, assists, cards, injury flag, market value, age),
 * and one call per player gives FotMob's percentile comparison against peers in
 * the same position. Those percentiles are turned into 0-100 attribute scores
 * (attacking / technical / creativity / defending / physical) plus explicit
 * strengths and weak spots.
 *
 * Nothing is invented: when a player has no published percentile profile we
 * store only what the squad feed gives us and leave the attribute bars empty.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FotmobProvider, type SquadMember } from "./providers/fotmob.server";
import { namesMatch, normalizeTeamName } from "./providers/normalize";

export interface AttributeSummary {
  status: "success" | "partial" | "failed";
  teams: number;
  players: number;
  profiled: number;
  errors: number;
  durationMs: number;
}

/** Which attribute bucket each FotMob percentile key contributes to. */
const BUCKETS: Record<string, keyof Buckets> = {
  goals: "attacking",
  shot_attempts: "attacking",
  shots_on_target: "attacking",
  xg: "attacking",
  non_penalty_xg: "attacking",
  conversion: "attacking",
  headed_goals: "attacking",
  penalty_goals: "attacking",

  chances_created: "creativity",
  assists: "creativity",
  xa: "creativity",
  expected_assists: "creativity",
  big_chances_created: "creativity",
  successful_crosses: "creativity",
  passes_into_final_third: "creativity",
  through_balls: "creativity",

  touches: "technical",
  pass_accuracy: "technical",
  passes_completed: "technical",
  accurate_passes: "technical",
  successful_dribbles: "technical",
  dribbles: "technical",
  ball_retention: "technical",
  long_balls_accurate: "technical",

  defensive_actions: "defending",
  tackles_won: "defending",
  tackles: "defending",
  interceptions: "defending",
  blocks: "defending",
  recoveries: "defending",
  clearances: "defending",
  saves: "defending",
  clean_sheets: "defending",
  save_percentage: "defending",
  goals_prevented: "defending",

  aerials_won: "physical",
  duels_won: "physical",
  ground_duels_won: "physical",
  fouls_won: "physical",
  possession_won: "physical",

  // Keys observed live on FotMob's public profiles.
  shot_attempts_: "attacking",
  clean_sheet: "defending",
  goals_conceded: "defending",
  keeper_high_claim: "defending",
  keeper_sweeper_actions: "defending",
  long_ball_succeeeded_accuracy: "technical",
};

/** Keyword fallback so new provider metric names still land in a bucket. */
const KEYWORDS: Array<[RegExp, keyof Buckets]> = [
  [/goal_?conceded|save|clean_?sheet|keeper|tackle|interception|block|clearance|defensive|recover/, "defending"],
  [/assist|chance|cross|through_?ball|key_?pass|final_?third/, "creativity"],
  [/goal|shot|xg|conversion|penalt|header/, "attacking"],
  [/pass|touch|dribbl|ball|carry|possession_?won?_?final/, "technical"],
  [/aerial|duel|foul|physical|distance|sprint|recovery/, "physical"],
];

function bucketFor(key: string): keyof Buckets | null {
  const direct = BUCKETS[key];
  if (direct) return direct;
  for (const [pattern, bucket] of KEYWORDS) if (pattern.test(key)) return bucket;
  return null;
}


interface Buckets {
  attacking: number[];
  technical: number[];
  creativity: number[];
  defending: number[];
  physical: number[];
}

function pctToScore(value: number): number {
  return Math.round(Math.min(99, Math.max(20, 25 + value * 70)));
}

function ratingToOverall(rating: number | null): number | null {
  if (rating === null || !Number.isFinite(rating) || rating <= 0) return null;
  return Math.round(Math.min(96, Math.max(40, 50 + (rating - 6.4) * 22)));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildAttributeCard(
  member: SquadMember,
  traits: Array<{ key: string; title: string; value: number }>,
  minutes: number | null,
) {
  const buckets: Buckets = {
    attacking: [],
    technical: [],
    creativity: [],
    defending: [],
    physical: [],
  };

  for (const trait of traits) {
    const bucket = bucketFor(trait.key);
    if (bucket) buckets[bucket].push(trait.value);
  }

  const score = (values: number[]) => {
    const mean = average(values);
    return mean === null ? null : pctToScore(mean);
  };

  const attacking = score(buckets.attacking);
  const technical = score(buckets.technical);
  const creativity = score(buckets.creativity);
  const defending = score(buckets.defending);
  const physical = score(buckets.physical);

  const present = [attacking, technical, creativity, defending, physical].filter(
    (value): value is number => value !== null,
  );
  const fromRating = ratingToOverall(member.rating);
  const fromTraits = present.length > 0 ? Math.round(average(present)!) : null;
  const overall =
    fromRating !== null && fromTraits !== null
      ? Math.round(fromRating * 0.5 + fromTraits * 0.5)
      : (fromRating ?? fromTraits);

  const ranked = [...traits].sort((a, b) => b.value - a.value);
  const strengths = ranked
    .filter((trait) => trait.value >= 0.66)
    .slice(0, 4)
    .map((trait) => ({ key: trait.key, label: trait.title, percentile: trait.value }));
  const weaknesses = ranked
    .filter((trait) => trait.value <= 0.34)
    .slice(-4)
    .reverse()
    .map((trait) => ({ key: trait.key, label: trait.title, percentile: trait.value }));

  return {
    source_id: "fotmob",
    provider_player_id: member.providerId,
    position_group: member.positionGroup,
    overall,
    attacking,
    technical,
    creativity,
    defending,
    physical,
    rating: member.rating,
    market_value: member.marketValue,
    age: member.age,
    minutes,
    traits: traits.map((trait) => ({ key: trait.key, label: trait.title, percentile: trait.value })),
    strengths,
    weaknesses,
  };
}

/**
 * Refreshes attribute cards for the clubs playing in the next `days` days.
 * Percentile lookups cost one request per player, so they are limited per run
 * and skipped for cards refreshed in the last week.
 */
export async function ingestPlayerAttributes(
  options: { days?: number; maxProfiles?: number; triggeredBy?: string } = {},
): Promise<AttributeSummary> {
  const startedAt = Date.now();
  const days = options.days ?? 5;
  const maxProfiles = options.maxProfiles ?? 120;
  const provider = new FotmobProvider();

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
    return { status: "success", teams: 0, players: 0, profiled: 0, errors: 0, durationMs: Date.now() - startedAt };
  }

  const { data: teams } = await supabaseAdmin
    .from("teams")
    .select("id, name, short_name, provider_ids")
    .in("id", [...teamIds]);

  const staleBefore = new Date(Date.now() - 7 * 86_400_000).toISOString();
  let players = 0;
  let profiled = 0;
  let errors = 0;
  let teamsDone = 0;

  for (const team of teams ?? []) {
    const providerIds = (team.provider_ids ?? {}) as Record<string, string>;
    let fotmobId = providerIds["fotmob"] ?? null;
    if (!fotmobId) {
      fotmobId = await provider.findTeamId(team.name);
      if (fotmobId) {
        await supabaseAdmin
          .from("teams")
          .update({ provider_ids: { ...providerIds, fotmob: fotmobId } })
          .eq("id", team.id);
      }
    }
    if (!fotmobId) {
      errors += 1;
      continue;
    }

    const squad = await provider.getSquad(fotmobId);
    if (!squad.ok) {
      errors += 1;
      continue;
    }
    teamsDone += 1;

    // Our players for this club, so provider members can be matched by name.
    const { data: memberships } = await supabaseAdmin
      .from("squad_memberships")
      .select("player_id, player:players(id, name, provider_ids)")
      .eq("team_id", team.id)
      .eq("is_current", true)
      .limit(80);

    const roster = (memberships ?? [])
      .map((row) => row.player as unknown as { id: string; name: string; provider_ids: Record<string, string> } | null)
      .filter((row): row is { id: string; name: string; provider_ids: Record<string, string> } => Boolean(row));

    for (const member of squad.data) {
      const match =
        roster.find((row) => (row.provider_ids ?? {})["fotmob"] === member.providerId) ??
        roster.find((row) => normalizeTeamName(row.name) === normalizeTeamName(member.name)) ??
        roster.find((row) => namesMatch(row.name, member.name, 0.86));
      if (!match) continue;

      const { data: existing } = await supabaseAdmin
        .from("player_attributes")
        .select("id, updated_at, traits")
        .eq("player_id", match.id)
        .maybeSingle();

      const hasFreshTraits =
        existing !== null &&
        Array.isArray(existing.traits) &&
        (existing.traits as unknown[]).length > 0 &&
        existing.updated_at > staleBefore;

      let traits: Array<{ key: string; title: string; value: number }> = [];
      let minutes: number | null = null;
      if (!hasFreshTraits && profiled < maxProfiles) {
        const detail = await provider.getPlayerTraits(member.providerId);
        if (detail.ok) {
          traits = detail.data.items;
          minutes = detail.data.minutes;
          profiled += 1;
        } else {
          errors += 1;
        }
      } else if (hasFreshTraits) {
        traits = (existing.traits as Array<{ key: string; label: string; percentile: number }>).map((trait) => ({
          key: trait.key,
          title: trait.label,
          value: trait.percentile,
        }));
      }

      const card = buildAttributeCard(member, traits, minutes);
      const { error } = await supabaseAdmin
        .from("player_attributes")
        .upsert({ player_id: match.id, ...card }, { onConflict: "player_id" });
      if (error) errors += 1;
      else players += 1;

      if (!(match.provider_ids ?? {})["fotmob"]) {
        await supabaseAdmin
          .from("players")
          .update({ provider_ids: { ...(match.provider_ids ?? {}), fotmob: member.providerId } })
          .eq("id", match.id);
      }
    }
  }

  return {
    status: errors > 0 ? (players > 0 ? "partial" : "failed") : "success",
    teams: teamsDone,
    players,
    profiled,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

/** Average squad quality per team, used as context for predictions and bets. */
export async function teamStrengthIndex(teamIds: string[]): Promise<Map<string, number>> {
  const strength = new Map<string, number>();
  if (teamIds.length === 0) return strength;

  const { data } = await supabaseAdmin
    .from("squad_memberships")
    .select("team_id, player:players(player_attributes(overall))")
    .in("team_id", teamIds)
    .eq("is_current", true);

  const grouped = new Map<string, number[]>();
  for (const row of (data ?? []) as unknown as Array<{
    team_id: string;
    player: { player_attributes: Array<{ overall: number | null }> } | null;
  }>) {
    const overall = row.player?.player_attributes?.[0]?.overall;
    if (typeof overall !== "number") continue;
    const list = grouped.get(row.team_id) ?? [];
    list.push(overall);
    grouped.set(row.team_id, list);
  }

  for (const [teamId, values] of grouped) {
    const top = values.sort((a, b) => b - a).slice(0, 14);
    strength.set(teamId, top.reduce((sum, value) => sum + value, 0) / top.length);
  }
  return strength;
}

export interface CareerSummary {
  status: "success" | "partial" | "failed";
  players: number;
  errors: number;
  durationMs: number;
}

/**
 * Persist FotMob career data (bio, season-by-season record, club history,
 * national-team caps) into player_careers for players we already track with a
 * FotMob id. Skips players fetched within the last 7 days.
 */
export async function ingestPlayerCareers(
  options: { maxProfiles?: number; triggeredBy?: string } = {},
): Promise<CareerSummary> {
  const startedAt = Date.now();
  const maxProfiles = options.maxProfiles ?? 60;
  const provider = new FotmobProvider();
  const staleBefore = new Date(Date.now() - 7 * 86_400_000).toISOString();

  // Players with a FotMob id, prioritising those in current squads of teams
  // with upcoming fixtures and those never fetched.
  const { data: rows } = await supabaseAdmin
    .from("players")
    .select("id, provider_ids")
    .not("provider_ids->>fotmob", "is", null)
    .limit(400);

  const { data: existing } = await supabaseAdmin
    .from("player_careers")
    .select("player_id, fetched_at");
  const fresh = new Set(
    (existing ?? []).filter((row) => row.fetched_at > staleBefore).map((row) => row.player_id),
  );

  let players = 0;
  let errors = 0;

  for (const row of rows ?? []) {
    if (players >= maxProfiles) break;
    if (fresh.has(row.id)) continue;
    const fotmobId = ((row.provider_ids ?? {}) as Record<string, string>)["fotmob"];
    if (!fotmobId) continue;

    const career = await provider.getPlayerCareer(fotmobId);
    if (!career.ok) {
      errors += 1;
      continue;
    }
    const c = career.data;
    const { error } = await supabaseAdmin.from("player_careers").upsert(
      {
        player_id: row.id,
        source: "fotmob",
        name: c.name,
        country: c.country,
        height: c.height,
        preferred_foot: c.preferredFoot,
        shirt: c.shirt,
        contract_end: c.contractEnd,
        market_value_label: c.marketValueLabel,
        position_description: c.positionDescription,
        current_season: c.currentSeason ?? {},
        seasons: c.seasons,
        clubs: c.clubs,
        national: c.national,
        injury: c.injury,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "player_id" },
    );
    if (error) errors += 1;
    else players += 1;
  }

  return {
    status: errors > 0 ? (players > 0 ? "partial" : "failed") : "success",
    players,
    errors,
    durationMs: Date.now() - startedAt,
  };
}
