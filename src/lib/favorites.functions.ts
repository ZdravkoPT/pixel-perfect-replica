import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FavoriteEntity = "team" | "league";

const MATCH_SELECT =
  "id, kickoff_at, status, minute, home_score, away_score, home_team_id, away_team_id, league_id, league:leagues(id, name, country, logo_url), home:teams!matches_home_team_id_fkey(id, name, short_name, tla, crest_url), away:teams!matches_away_team_id_fkey(id, name, short_name, tla, crest_url)";

function parseEntity(value: string): FavoriteEntity {
  if (value !== "team" && value !== "league") throw new Error("Unsupported favourite type");
  return value;
}

/** Everything the signed-in user follows, with display names resolved. */
export const listFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await context.supabase
      .from("favorites")
      .select("id, entity_type, entity_id, created_at")
      .order("created_at", { ascending: false });

    const favorites = rows ?? [];
    const teamIds = favorites.filter((f) => f.entity_type === "team").map((f) => f.entity_id);
    const leagueIds = favorites.filter((f) => f.entity_type === "league").map((f) => f.entity_id);

    const [teams, leagues] = await Promise.all([
      teamIds.length
        ? context.supabase.from("teams").select("id, name, crest_url").in("id", teamIds)
        : Promise.resolve({ data: [] as { id: string; name: string; crest_url: string | null }[] }),
      leagueIds.length
        ? context.supabase.from("leagues").select("id, name, logo_url").in("id", leagueIds)
        : Promise.resolve({ data: [] as { id: string; name: string; logo_url: string | null }[] }),
    ]);

    const teamById = new Map((teams.data ?? []).map((t) => [t.id, t]));
    const leagueById = new Map((leagues.data ?? []).map((l) => [l.id, l]));

    return {
      favorites: favorites.map((favorite) => ({
        ...favorite,
        name:
          favorite.entity_type === "team"
            ? (teamById.get(favorite.entity_id)?.name ?? "Unknown team")
            : (leagueById.get(favorite.entity_id)?.name ?? "Unknown league"),
        image:
          favorite.entity_type === "team"
            ? (teamById.get(favorite.entity_id)?.crest_url ?? null)
            : (leagueById.get(favorite.entity_id)?.logo_url ?? null),
      })),
    };
  });

/** Follow / unfollow a team or league; returns the resulting state. */
export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entityType: string; entityId: string }) => ({
    entityType: parseEntity(input.entityType),
    entityId: input.entityId,
  }))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("favorites")
      .select("id")
      .eq("user_id", context.userId)
      .eq("entity_type", data.entityType)
      .eq("entity_id", data.entityId)
      .maybeSingle();

    if (existing) {
      await context.supabase.from("favorites").delete().eq("id", existing.id);
      return { following: false };
    }

    const { error } = await context.supabase.from("favorites").insert({
      user_id: context.userId,
      entity_type: data.entityType,
      entity_id: data.entityId,
    });
    if (error) throw new Error(error.message);
    return { following: true };
  });

/** Upcoming + recent fixtures involving anything the user follows, with model picks. */
export const listWatchlistMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => ({ days: input?.days ?? 14 }))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("favorites")
      .select("entity_type, entity_id");
    const favorites = rows ?? [];
    if (favorites.length === 0) return { matches: [], predictions: {}, empty: true };

    const teamIds = favorites.filter((f) => f.entity_type === "team").map((f) => f.entity_id);
    const leagueIds = favorites.filter((f) => f.entity_type === "league").map((f) => f.entity_id);

    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + data.days * 86_400_000);
    const since = new Date(from.getTime() - 3 * 86_400_000);

    const filters: string[] = [];
    if (teamIds.length) {
      filters.push(`home_team_id.in.(${teamIds.join(",")})`, `away_team_id.in.(${teamIds.join(",")})`);
    }
    if (leagueIds.length) filters.push(`league_id.in.(${leagueIds.join(",")})`);

    const { data: matches, error } = await context.supabase
      .from("matches")
      .select(MATCH_SELECT)
      .gte("kickoff_at", since.toISOString())
      .lte("kickoff_at", to.toISOString())
      .or(filters.join(","))
      .order("kickoff_at", { ascending: true })
      .limit(200);

    if (error) return { matches: [], predictions: {}, empty: false, error: error.message };

    const ids = (matches ?? []).map((match) => match.id);
    const predictions: Record<
      string,
      { p_home: number; p_draw: number; p_away: number; confidence: number | null }
    > = {};

    if (ids.length) {
      const { data: preds } = await context.supabase
        .from("predictions")
        .select("match_id, p_home, p_draw, p_away, confidence, prediction_timestamp")
        .in("match_id", ids)
        .order("prediction_timestamp", { ascending: false });
      for (const pred of preds ?? []) {
        if (predictions[pred.match_id]) continue;
        predictions[pred.match_id] = {
          p_home: Number(pred.p_home),
          p_draw: Number(pred.p_draw),
          p_away: Number(pred.p_away),
          confidence: pred.confidence === null ? null : Number(pred.confidence),
        };
      }
    }

    return { matches: matches ?? [], predictions, empty: false };
  });
