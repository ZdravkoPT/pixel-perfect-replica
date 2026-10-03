import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/** Career stats, club moves (transfers), appearances and minutes for one player. */
export const getPlayerStats = createServerFn({ method: "GET" })
  .inputValidator((input: { playerId: string }) => input)
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const [{ data: player }, { data: career }, { data: condition }, { data: memberships }] = await Promise.all([
      supabase.from("players").select("id, name, position, nationality, birth_date").eq("id", data.playerId).maybeSingle(),
      supabase
        .from("player_careers")
        .select("current_season, seasons, clubs, national, market_value_label, fetched_at")
        .eq("player_id", data.playerId)
        .maybeSingle(),
      supabase
        .from("player_conditions")
        .select("matches_30d, minutes_30d, starts_recent, matches_recent, minutes_recent, recent_matches, fetched_at")
        .eq("player_id", data.playerId)
        .maybeSingle(),
      supabase
        .from("squad_memberships")
        .select("shirt_number, position, is_current, on_loan, team:teams(id, name)")
        .eq("player_id", data.playerId)
        .order("is_current", { ascending: false }),
    ]);
    return { player, career, condition, memberships: memberships ?? [] };
  });

/** Form score from the player's last 5 stored games (rating, goals/assists + our xG, minutes). */
export const getPlayerForm = createServerFn({ method: "GET" })
  .inputValidator((input: { playerId: string }) => input)
  .handler(async ({ data }) => {
    const { computePlayerForm } = await import("@/lib/models/player-form");
    const supabase = publicClient();
    const { data: rows } = await supabase
      .from("player_match_stats")
      .select("match_id, minutes, rating, goals, assists, shots, matches!inner(kickoff_at)")
      .eq("player_id", data.playerId)
      .gt("minutes", 0)
      .order("kickoff_at", { referencedTable: "matches", ascending: false })
      .limit(40);
    const sorted = (rows ?? [])
      .map((r) => ({ ...r, kickoff: (r as unknown as { matches: { kickoff_at: string } }).matches.kickoff_at }))
      .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
      .slice(0, 5);
    if (sorted.length === 0) return null;
    const { data: shots } = await supabase
      .from("match_shots")
      .select("match_id, model_xg")
      .eq("player_id", data.playerId)
      .in("match_id", sorted.map((r) => r.match_id));
    const xgBy = new Map<string, number>();
    let anyXg = false;
    for (const s of shots ?? []) {
      if (s.model_xg === null) continue;
      anyXg = true;
      xgBy.set(s.match_id, (xgBy.get(s.match_id) ?? 0) + Number(s.model_xg));
    }
    return computePlayerForm(
      sorted.map((r) => ({
        minutes: r.minutes,
        rating: r.rating === null ? null : Number(r.rating),
        goals: r.goals,
        assists: r.assists,
        shots: r.shots,
        xg: anyXg ? (xgBy.get(r.match_id) ?? 0) : null,
      })),
    );
  });
