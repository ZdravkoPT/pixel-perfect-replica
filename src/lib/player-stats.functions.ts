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
