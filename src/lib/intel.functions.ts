import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

async function assertAdmin(supabase: {
  rpc: (name: "has_role", args: { _user_id: string; _role: "admin" }) => Promise<{ data: unknown }>;
}, userId: string): Promise<void> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: admin role required");
}

/** Line-ups, injuries, referee profile, derived markets and props for a match. */
export const getMatchIntel = createServerFn({ method: "GET" })
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const supabase = publicClient();

    const [{ data: lineups }, { data: officials }, { data: props }, { data: match }] =
      await Promise.all([
        supabase
          .from("lineups")
          .select(
            "id, team_id, formation, is_predicted, confidence, players:lineup_players(player_id, position, is_starter, start_probability, expected_minutes, player:players(id, name, position, nationality))",
          )
          .eq("match_id", data.matchId),
        supabase
          .from("match_officials")
          .select("role, referee:referees(id, name, country)")
          .eq("match_id", data.matchId),
        supabase
          .from("player_prop_predictions")
          .select(
            "id, market, selection, line, probability, fair_odds, expected_minutes, team_id, player:players(id, name, position)",
          )
          .eq("match_id", data.matchId)
          .order("probability", { ascending: false })
          .limit(200),
        supabase
          .from("matches")
          .select("home_team_id, away_team_id")
          .eq("id", data.matchId)
          .maybeSingle(),
      ]);

    const teamIds = [match?.home_team_id, match?.away_team_id].filter(
      (id): id is string => typeof id === "string",
    );

    const { data: injuries } = teamIds.length
      ? await supabase
          .from("injuries")
          .select("id, team_id, kind, reason, status, expected_return, player:players(id, name, position)")
          .in("team_id", teamIds)
          .is("resolved_at", null)
      : { data: [] };

    // Derived corner / card markets live on the latest prediction for the match.
    const { data: prediction } = await supabase
      .from("predictions")
      .select("id")
      .eq("match_id", data.matchId)
      .order("prediction_timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: markets } = prediction
      ? await supabase
          .from("prediction_markets")
          .select("market, selection, probability, fair_odds")
          .eq("prediction_id", prediction.id)
          .in("market", ["corners", "cards"])
      : { data: [] };

    // Referee history from our own match archive (matches, goals, home wins).
    const refereeId = (officials ?? []).find((row) => row.role === "referee")?.referee?.id ?? null;
    let refereeProfile: {
      matches: number;
      goalsPerGame: number | null;
      homeWinRate: number | null;
    } | null = null;

    if (refereeId) {
      const { data: appointments } = await supabase
        .from("match_officials")
        .select("match:matches(status, home_score, away_score)")
        .eq("referee_id", refereeId)
        .limit(500);

      const finished = (appointments ?? [])
        .map((row) => row.match)
        .filter(
          (m): m is { status: string; home_score: number; away_score: number } =>
            !!m && m.status === "FINISHED" && m.home_score !== null && m.away_score !== null,
        );

      refereeProfile = {
        matches: finished.length,
        goalsPerGame: finished.length
          ? Math.round(
              (finished.reduce((sum, m) => sum + m.home_score + m.away_score, 0) /
                finished.length) *
                100,
            ) / 100
          : null,
        homeWinRate: finished.length
          ? Math.round(
              (finished.filter((m) => m.home_score > m.away_score).length / finished.length) * 1000,
            ) / 1000
          : null,
      };
    }

    return {
      lineups: lineups ?? [],
      officials: officials ?? [],
      injuries: injuries ?? [],
      props: props ?? [],
      markets: markets ?? [],
      refereeProfile,
      homeTeamId: match?.home_team_id ?? null,
      awayTeamId: match?.away_team_id ?? null,
    };
  });

/** Player directory with search, used by the /players page. */
export const searchPlayers = createServerFn({ method: "GET" })
  .inputValidator((input: { query?: string; limit?: number } | undefined) => ({
    query: (input?.query ?? "").trim(),
    limit: Math.min(input?.limit ?? 50, 100),
  }))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    let request = supabase
      .from("squad_memberships")
      .select(
        "id, shirt_number, position, player:players(id, name, position, nationality, birth_date), team:teams(id, name, crest_url)",
      )
      .eq("is_current", true)
      .limit(data.limit);

    if (data.query) {
      const { data: matchesByName } = await supabase
        .from("players")
        .select("id")
        .ilike("name", `%${data.query}%`)
        .limit(data.limit);
      const ids = (matchesByName ?? []).map((row) => row.id);
      if (ids.length === 0) return { players: [] };
      request = request.in("player_id", ids);
    }

    const { data: rows } = await request;
    return { players: rows ?? [] };
  });

export const syncSquads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { ingestSquads } = await import("./intel.server");
    return ingestSquads({ triggeredBy: "manual" });
  });

export const syncOfficials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { ingestOfficials } = await import("./intel.server");
    return ingestOfficials({ triggeredBy: "manual" });
  });

export const refreshIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { runIntel } = await import("./intel.server");
    return runIntel({ triggeredBy: "manual" });
  });

/* ------------------------------------------------------------------ */
/* Player profile: per-90 averages, strengths and weak points          */
/* ------------------------------------------------------------------ */

export interface PerNinety {
  key: string;
  label: string;
  value: number;
  unit: string;
}

/**
 * Per-90 averages are computed from observed match stats. Physical metrics
 * (top speed, distance covered) are tracking-data products that none of our
 * current feeds expose, so they are reported as unavailable rather than faked.
 */
export const getPlayerProfile = createServerFn({ method: "GET" })
  .inputValidator((input: { playerId: string }) => input)
  .handler(async ({ data }) => {
    const supabase = publicClient();

    const [
      { data: player },
      { data: memberships },
      { data: injuries },
      { data: stats },
      { data: props },
      { data: attributes },
      { data: career },
    ] =
      await Promise.all([
        supabase
          .from("players")
          .select("id, name, position, nationality, birth_date, height_cm, weight_kg, photo_url")
          .eq("id", data.playerId)
          .maybeSingle(),
        supabase
          .from("squad_memberships")
          .select("id, shirt_number, position, is_current, on_loan, joined_at, left_at, team:teams(id, name, crest_url)")
          .eq("player_id", data.playerId)
          .order("is_current", { ascending: false }),
        supabase
          .from("injuries")
          .select("id, kind, reason, status, expected_return, reported_at")
          .eq("player_id", data.playerId)
          .is("resolved_at", null),
        supabase
          .from("player_match_stats")
          .select(
            "minutes, goals, assists, shots, shots_on_target, passes, key_passes, tackles, fouls_committed, fouls_drawn, yellow_cards, red_cards, saves, rating, payload",
          )
          .eq("player_id", data.playerId)
          .limit(200),
        supabase
          .from("player_prop_predictions")
          .select("id, market, selection, line, probability, fair_odds, expected_minutes, match:matches(id, kickoff_at, home_team_id, away_team_id)")
          .eq("player_id", data.playerId)
          .order("probability", { ascending: false })
          .limit(12),
        supabase
          .from("player_attributes")
          .select(
            "overall, attacking, technical, creativity, defending, physical, rating, market_value, age, minutes, position_group, strengths, weaknesses, updated_at",
          )
          .eq("player_id", data.playerId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("player_careers")
          .select(
            "country, height, preferred_foot, shirt, contract_end, market_value_label, position_description, current_season, seasons, clubs, national, fetched_at",
          )
          .eq("player_id", data.playerId)
          .maybeSingle(),
      ]);

    const rows = stats ?? [];
    const minutes = rows.reduce((sum, row) => sum + (row.minutes ?? 0), 0);
    const per90 = (total: number): number => (minutes > 0 ? (total / minutes) * 90 : 0);
    const sum = (pick: (row: (typeof rows)[number]) => number): number =>
      rows.reduce((total, row) => total + (pick(row) || 0), 0);

    const payloadSum = (key: string): number =>
      rows.reduce((total, row) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const value = Number(payload[key]);
        return total + (Number.isFinite(value) ? value : 0);
      }, 0);

    const passesTotal = sum((row) => row.passes ?? 0);
    const accuratePasses = payloadSum("accurate_passes");
    const longPasses = payloadSum("long_passes");
    const dribbles = payloadSum("dribbles_completed");
    const recoveries = payloadSum("recoveries");
    const interceptions = payloadSum("interceptions");
    const duelsWon = payloadSum("duels_won");
    const distanceKm = payloadSum("distance_km");
    const topSpeed = payloadSum("top_speed_kmh");

    const averages: PerNinety[] = minutes
      ? [
          { key: "passes", label: "Passes", value: per90(passesTotal), unit: "/90" },
          { key: "accurate_passes", label: "Accurate passes", value: per90(accuratePasses), unit: "/90" },
          { key: "long_passes", label: "Long passes", value: per90(longPasses), unit: "/90" },
          { key: "key_passes", label: "Key passes", value: per90(sum((row) => row.key_passes ?? 0)), unit: "/90" },
          { key: "dribbles", label: "Dribbles completed", value: per90(dribbles), unit: "/90" },
          { key: "defensive", label: "Defensive actions (tackles + interceptions)", value: per90(sum((row) => row.tackles ?? 0) + interceptions), unit: "/90" },
          { key: "recoveries", label: "Ball recoveries", value: per90(recoveries), unit: "/90" },
          { key: "duels_won", label: "Duels won", value: per90(duelsWon), unit: "/90" },
          { key: "shots", label: "Shots", value: per90(sum((row) => row.shots ?? 0)), unit: "/90" },
          { key: "goals", label: "Goals", value: per90(sum((row) => row.goals ?? 0)), unit: "/90" },
          { key: "assists", label: "Assists", value: per90(sum((row) => row.assists ?? 0)), unit: "/90" },
          { key: "cards", label: "Yellow cards", value: per90(sum((row) => row.yellow_cards ?? 0)), unit: "/90" },
          { key: "distance", label: "Distance covered", value: per90(distanceKm), unit: "km/90" },
          { key: "top_speed", label: "Top speed", value: rows.length ? topSpeed / rows.length : 0, unit: "km/h" },
        ].filter((row) => row.value > 0)
      : [];

    const passAccuracy = passesTotal > 0 && accuratePasses > 0 ? accuratePasses / passesTotal : null;

    // Strengths / weak points: per-90 rates compared with players of the same
    // position that we have stats for. Only shown once a sample exists.
    const strengths = [...averages]
      .filter((row) => !["cards", "top_speed"].includes(row.key))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
    const weaknesses = [...averages]
      .filter((row) => !["cards", "top_speed", "distance"].includes(row.key))
      .sort((a, b) => a.value - b.value)
      .slice(0, 3);

    const { data: condition } = await supabase
      .from("player_conditions")
      .select(
        "matches_30d, minutes_30d, matches_recent, minutes_recent, starts_recent, avg_rating_recent, avg_rating_prior, rating_trend, goals_recent, assists_recent, days_since_last_match, minutes_share, load_index, sharpness, availability, injury, recent_matches, fetched_at",
      )
      .eq("player_id", data.playerId)
      .maybeSingle();

    return {
      player: player ?? null,
      memberships: memberships ?? [],
      injuries: injuries ?? [],
      props: props ?? [],
      sample: { matches: rows.length, minutes },
      averages,
      passAccuracy,
      strengths,
      weaknesses,
      attributes: attributes ?? null,
      career: career ?? null,
      condition: condition ?? null,
    };
  });


/* ------------------------------------------------------------------ */
/* Coaches                                                             */
/* ------------------------------------------------------------------ */

export const listCoaches = createServerFn({ method: "GET" })
  .inputValidator((input: { query?: string; limit?: number } | undefined) => ({
    query: (input?.query ?? "").trim(),
    limit: Math.min(input?.limit ?? 60, 120),
  }))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    let request = supabase
      .from("coaches")
      .select("id, name, nationality, birth_date, spells:coach_spells(is_current, team:teams(id, name, crest_url))")
      .order("name")
      .limit(data.limit);

    if (data.query) request = request.ilike("name", `%${data.query}%`);

    const { data: rows } = await request;
    return { coaches: rows ?? [] };
  });

export const getCoach = createServerFn({ method: "GET" })
  .inputValidator((input: { coachId: string }) => input)
  .handler(async ({ data }) => {
    const supabase = publicClient();

    const [{ data: coach }, { data: spells }] = await Promise.all([
      supabase
        .from("coaches")
        .select("id, name, nationality, birth_date, photo_url")
        .eq("id", data.coachId)
        .maybeSingle(),
      supabase
        .from("coach_spells")
        .select("id, started_at, ended_at, is_current, team:teams(id, name, crest_url, country)")
        .eq("coach_id", data.coachId)
        .order("is_current", { ascending: false }),
    ]);

    // Record while in charge, from our own match archive. Only spells with a
    // known start date can be attributed honestly.
    const record: Array<{
      teamId: string;
      teamName: string;
      isCurrent: boolean;
      from: string | null;
      to: string | null;
      played: number;
      won: number;
      drawn: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
      pointsPerGame: number | null;
    }> = [];

    for (const spell of spells ?? []) {
      const team = spell.team as { id: string; name: string } | null;
      if (!team) continue;

      let query = supabase
        .from("matches")
        .select("home_team_id, away_team_id, home_score, away_score, kickoff_at")
        .eq("status", "FINISHED")
        .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
        .order("kickoff_at", { ascending: false })
        .limit(400);

      if (spell.started_at) query = query.gte("kickoff_at", spell.started_at);
      if (spell.ended_at) query = query.lte("kickoff_at", spell.ended_at);

      const { data: played } = await query;
      const games = (played ?? []).filter(
        (row) => row.home_score !== null && row.away_score !== null,
      );

      let won = 0;
      let drawn = 0;
      let lost = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;
      for (const game of games) {
        const isHome = game.home_team_id === team.id;
        const scored = (isHome ? game.home_score : game.away_score) ?? 0;
        const conceded = (isHome ? game.away_score : game.home_score) ?? 0;
        goalsFor += scored;
        goalsAgainst += conceded;
        if (scored > conceded) won += 1;
        else if (scored === conceded) drawn += 1;
        else lost += 1;
      }

      record.push({
        teamId: team.id,
        teamName: team.name,
        isCurrent: spell.is_current,
        from: spell.started_at,
        to: spell.ended_at,
        played: games.length,
        won,
        drawn,
        lost,
        goalsFor,
        goalsAgainst,
        pointsPerGame: games.length ? Number(((won * 3 + drawn) / games.length).toFixed(2)) : null,
      });
    }

    const { data: dossier } = await supabase
      .from("coach_profiles")
      .select("career, seasons, achievements, totals, nationality, fetched_at")
      .eq("coach_id", data.coachId)
      .maybeSingle();

    return { coach: coach ?? null, spells: spells ?? [], record, dossier: dossier ?? null };
  });

export const refreshKickoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { runKickoffRefresh } = await import("./kickoff.server");
    return runKickoffRefresh({ triggeredBy: "manual", windowMinutes: 70 });
  });

/** Refresh FIFA-style player attribute cards for clubs with upcoming fixtures. */
export const refreshAttributes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { ingestPlayerAttributes } = await import("./attributes.server");
    return ingestPlayerAttributes({ triggeredBy: "manual" });
  });

/** Refresh manager dossiers: career, assistant spells, club records, trophies. */
export const refreshCoachProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { ingestCoachProfiles } = await import("./coach-intel.server");
    return ingestCoachProfiles({ triggeredBy: "manual" });
  });

/** Refresh player condition: recent load, sharpness, availability. */
export const refreshPlayerConditions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { ingestPlayerConditions } = await import("./coach-intel.server");
    return ingestPlayerConditions({ triggeredBy: "manual" });
  });

/** Refresh career records (season stats, club history, national caps). */
export const refreshCareers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { ingestPlayerCareers } = await import("./attributes.server");
    return ingestPlayerCareers({ triggeredBy: "manual" });
  });

/** Re-run the past-10-week bet-builder review so the calibration stays current. */
export const runBetHistoryReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { runBetHistory } = await import("./bet-history.server");
    return runBetHistory({ weeks: 10, triggeredBy: "manual" });
  });

/* ------------------------------------------------------------------ */
/* Head to head                                                        */
/* ------------------------------------------------------------------ */

/** Previous meetings between the two clubs of a fixture, from our own archive. */
export const getHeadToHead = createServerFn({ method: "GET" })
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

    if (!match) return { meetings: [], summary: null, homeName: "Home", awayName: "Away" };

    const homeId = match.home_team_id;
    const awayId = match.away_team_id;
    const homeName = (match.home as { name: string } | null)?.name ?? "Home";
    const awayName = (match.away as { name: string } | null)?.name ?? "Away";

    const { data: rows } = await supabase
      .from("matches")
      .select(
        "id, kickoff_at, status, home_team_id, away_team_id, home_score, away_score, league:leagues(name)",
      )
      .neq("id", data.matchId)
      .in("home_team_id", [homeId, awayId])
      .in("away_team_id", [homeId, awayId])
      .eq("status", "FINISHED")
      .order("kickoff_at", { ascending: false })
      .limit(20);

    const meetings = (rows ?? []).filter(
      (row) =>
        (row.home_team_id === homeId && row.away_team_id === awayId) ||
        (row.home_team_id === awayId && row.away_team_id === homeId),
    );

    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    let goalsHome = 0;
    let goalsAway = 0;
    let over25 = 0;
    let btts = 0;
    for (const row of meetings) {
      const hs = row.home_score ?? 0;
      const as = row.away_score ?? 0;
      const isHomeTeamHome = row.home_team_id === homeId;
      const forHome = isHomeTeamHome ? hs : as;
      const forAway = isHomeTeamHome ? as : hs;
      goalsHome += forHome;
      goalsAway += forAway;
      if (forHome > forAway) homeWins += 1;
      else if (forAway > forHome) awayWins += 1;
      else draws += 1;
      if (hs + as > 2.5) over25 += 1;
      if (hs > 0 && as > 0) btts += 1;
    }

    const played = meetings.length;
    return {
      homeName,
      awayName,
      meetings: meetings.map((row) => ({
        id: row.id,
        kickoffAt: row.kickoff_at,
        league: (row.league as { name: string } | null)?.name ?? "Unknown league",
        homeTeam: row.home_team_id === homeId ? homeName : awayName,
        awayTeam: row.away_team_id === homeId ? homeName : awayName,
        homeScore: row.home_score,
        awayScore: row.away_score,
      })),
      summary: played
        ? {
            played,
            homeWins,
            draws,
            awayWins,
            goalsHome,
            goalsAway,
            over25Rate: over25 / played,
            bttsRate: btts / played,
          }
        : null,
    };
  });

/* ------------------------------------------------------------------ */
/* Team squads: season stats, availability, positions                  */
/* ------------------------------------------------------------------ */

export const listTeams = createServerFn({ method: "GET" })
  .inputValidator((input: { query?: string; limit?: number } | undefined) => ({
    query: (input?.query ?? "").trim(),
    limit: Math.min(input?.limit ?? 80, 200),
  }))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    let request = supabase
      .from("teams")
      .select("id, name, short_name, country, crest_url")
      .order("name")
      .limit(data.limit);
    if (data.query) request = request.ilike("name", `%${data.query}%`);
    const { data: rows } = await request;
    return { teams: rows ?? [] };
  });

export const getTeamSquad = createServerFn({ method: "GET" })
  .inputValidator((input: { teamId: string }) => input)
  .handler(async ({ data }) => {
    const supabase = publicClient();

    const [{ data: team }, { data: memberships }, { data: injuries }] = await Promise.all([
      supabase
        .from("teams")
        .select("id, name, short_name, country, crest_url")
        .eq("id", data.teamId)
        .maybeSingle(),
      supabase
        .from("squad_memberships")
        .select(
          "id, shirt_number, position, on_loan, player:players(id, name, position, nationality, birth_date)",
        )
        .eq("team_id", data.teamId)
        .eq("is_current", true)
        .limit(120),
      supabase
        .from("injuries")
        .select("player_id, kind, reason, status, expected_return")
        .eq("team_id", data.teamId)
        .is("resolved_at", null),
    ]);

    const playerIds = (memberships ?? [])
      .map((row) => (row.player as { id: string } | null)?.id)
      .filter((id): id is string => typeof id === "string");

    const [{ data: careers }, { data: attrRows }, { data: spellRows }] = await Promise.all([
      playerIds.length
        ? supabase
            .from("player_careers")
            .select("player_id, current_season, seasons, market_value_label")
            .in("player_id", playerIds)
        : Promise.resolve({ data: [] as never[] }),
      playerIds.length
        ? supabase
            .from("player_attributes")
            .select("player_id, overall, attacking, technical, creativity, defending, physical, rating")
            .in("player_id", playerIds)
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from("coach_spells")
        .select("coach_id, started_at, ended_at, is_current, coach:coaches(id, name, nationality)")
        .eq("team_id", data.teamId)
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(30),
    ]);

    const managers = (spellRows ?? []).map((row) => {
      const coach = row.coach as { id: string; name: string; nationality: string | null } | null;
      return {
        coachId: row.coach_id as string,
        name: coach?.name ?? "Unknown",
        nationality: coach?.nationality ?? null,
        from: row.started_at as string | null,
        to: row.ended_at as string | null,
        isCurrent: !!row.is_current,
      };
    });
    const currentManager = managers.find((row) => row.isCurrent) ?? managers[0] ?? null;
    const { data: dossier } = currentManager
      ? await supabase
          .from("coach_profiles")
          .select("career, seasons, achievements, totals, fetched_at")
          .eq("coach_id", currentManager.coachId)
          .maybeSingle()
      : { data: null };

    const attrById = new Map(
      (attrRows ?? []).map((row) => [row.player_id as string, row]),
    );

    type Season = {
      season?: string;
      league?: string;
      matches?: number | null;
      goals?: number | null;
      assists?: number | null;
      minutes?: number | null;
      rating?: number | null;
      appearances?: number;
      team?: string | null;
    };

    const careerById = new Map(
      (careers ?? []).map((row) => [row.player_id as string, row]),
    );
    const injuryById = new Map(
      (injuries ?? []).map((row) => [row.player_id as string, row]),
    );

    const now = Date.now();
    const players = (memberships ?? []).map((row) => {
      const player = row.player as {
        id: string;
        name: string;
        position: string | null;
        nationality: string | null;
        birth_date: string | null;
      } | null;
      const career = player ? careerById.get(player.id) : undefined;
      const currentRaw = (career?.current_season ?? null) as Season | null;
      const current =
        currentRaw && Object.keys(currentRaw).length > 0 ? currentRaw : null;
      const seasons = ((career?.seasons ?? []) as Season[]).filter(Boolean);
      const previous = seasons.length > 1 ? seasons[1] : (seasons[0] ?? null);
      const injury = player ? injuryById.get(player.id) : undefined;
      const age = player?.birth_date
        ? Math.floor((now - new Date(player.birth_date).getTime()) / 31557600000)
        : null;

      return {
        membershipId: row.id,
        playerId: player?.id ?? null,
        name: player?.name ?? "Unknown",
        nationality: player?.nationality ?? null,
        age,
        shirt: row.shirt_number,
        position: row.position ?? player?.position ?? null,
        onLoan: row.on_loan ?? false,
        marketValue: (career?.market_value_label as string | null) ?? null,
        current: current
          ? {
              season: current.season ?? "Current",
              league: current.league ?? null,
              apps: current.matches ?? current.appearances ?? null,
              goals: current.goals ?? null,
              assists: current.assists ?? null,
              minutes: current.minutes ?? null,
              rating: current.rating ?? null,
            }
          : null,
        previous: previous
          ? {
              season: previous.season ?? "Previous",
              league: previous.team ?? previous.league ?? null,
              apps: previous.appearances ?? previous.matches ?? null,
              goals: previous.goals ?? null,
              assists: previous.assists ?? null,
              minutes: previous.minutes ?? null,
              rating: previous.rating ?? null,
            }
          : null,
        availability: injury
          ? {
              status: (injury.status as string | null) ?? "doubt",
              kind: (injury.kind as string | null) ?? null,
              reason: (injury.reason as string | null) ?? null,
              expectedReturn: (injury.expected_return as string | null) ?? null,
            }
          : null,
      };
    });

    const playersWithCards = players.map((row) => {
      const a = row.playerId ? attrById.get(row.playerId) : undefined;
      return {
        ...row,
        card: a
          ? {
              overall: a.overall as number | null,
              attacking: a.attacking as number | null,
              technical: a.technical as number | null,
              creativity: a.creativity as number | null,
              defending: a.defending as number | null,
              physical: a.physical as number | null,
              rating: a.rating === null ? null : Number(a.rating),
            }
          : null,
      };
    });

    return { team: team ?? null, players: playersWithCards, managers, currentManager, dossier: dossier ?? null };
  });

/** Side-by-side comparison of two players: current season, previous season, career. */
export const comparePlayers = createServerFn({ method: "GET" })
  .inputValidator((input: { playerIds: string[] }) => ({
    playerIds: input.playerIds.filter(Boolean).slice(0, 2),
  }))
  .handler(async ({ data }) => {
    const supabase = publicClient();

    const results = await Promise.all(
      data.playerIds.map(async (playerId) => {
        const [{ data: player }, { data: membership }, { data: career }, { data: attributes }, { data: injury }] =
          await Promise.all([
            supabase
              .from("players")
              .select("id, name, position, nationality, birth_date, photo_url")
              .eq("id", playerId)
              .maybeSingle(),
            supabase
              .from("squad_memberships")
              .select("shirt_number, position, team:teams(id, name, crest_url)")
              .eq("player_id", playerId)
              .eq("is_current", true)
              .limit(1)
              .maybeSingle(),
            supabase
              .from("player_careers")
              .select(
                "country, height, preferred_foot, contract_end, market_value_label, position_description, current_season, seasons, clubs, national",
              )
              .eq("player_id", playerId)
              .maybeSingle(),
            supabase
              .from("player_attributes")
              .select("overall, attacking, technical, creativity, defending, physical, rating, minutes, strengths, weaknesses")
              .eq("player_id", playerId)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("injuries")
              .select("kind, reason, status, expected_return")
              .eq("player_id", playerId)
              .is("resolved_at", null)
              .limit(1)
              .maybeSingle(),
          ]);

        return {
          player: player ?? null,
          membership: membership ?? null,
          career: career ?? null,
          attributes: attributes ?? null,
          injury: injury ?? null,
        };
      }),
    );

    return { players: results };
  });
