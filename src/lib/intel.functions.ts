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
