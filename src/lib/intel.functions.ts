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

    return { coach: coach ?? null, spells: spells ?? [], record };
  });

export const refreshKickoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { runKickoffRefresh } = await import("./kickoff.server");
    return runKickoffRefresh({ triggeredBy: "manual", windowMinutes: 70 });
  });
