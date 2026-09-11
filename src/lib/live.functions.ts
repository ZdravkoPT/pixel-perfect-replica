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
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const SELECT =
  "id, kickoff_at, status, minute, home_score, away_score, league:leagues(id, name, country), home:teams!matches_home_team_id_fkey(id, name, tla, crest_url), away:teams!matches_away_team_id_fkey(id, name, tla, crest_url)";

/**
 * Everything that is on the pitch right now, plus fixtures whose kick-off has
 * passed within the last 3 hours (the provider can lag behind the clock) and
 * the next few hours of upcoming games.
 */
export const listLiveMatches = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const now = Date.now();
  const from = new Date(now - 3.5 * 3_600_000).toISOString();
  const to = new Date(now + 6 * 3_600_000).toISOString();

  const { data: matches, error } = await supabase
    .from("matches")
    .select(SELECT)
    .gte("kickoff_at", from)
    .lte("kickoff_at", to)
    .order("kickoff_at", { ascending: true })
    .limit(120);

  if (error) return { live: [], upcoming: [], finished: [], error: error.message, at: new Date().toISOString() };

  const rows = matches ?? [];
  const live: typeof rows = [];
  const upcoming: typeof rows = [];
  const finished: typeof rows = [];

  for (const match of rows) {
    const kickoff = new Date(match.kickoff_at).getTime();
    if (match.status === "FINISHED") finished.push(match);
    else if (match.status === "LIVE" || match.status === "PAUSED" || kickoff <= now) live.push(match);
    else upcoming.push(match);
  }

  // Predictions for the in-play games so the page can show the live model view.
  const liveIds = live.map((m) => m.id);
  let predictions: Array<{
    match_id: string;
    p_home: number;
    p_draw: number;
    p_away: number;
    prediction_timestamp: string;
  }> = [];
  if (liveIds.length > 0) {
    const { data } = await supabase
      .from("predictions")
      .select("match_id, p_home, p_draw, p_away, prediction_timestamp")
      .in("match_id", liveIds)
      .order("prediction_timestamp", { ascending: false });
    const seen = new Set<string>();
    for (const row of data ?? []) {
      if (seen.has(row.match_id)) continue;
      seen.add(row.match_id);
      predictions.push({
        match_id: row.match_id,
        p_home: Number(row.p_home),
        p_draw: Number(row.p_draw),
        p_away: Number(row.p_away),
        prediction_timestamp: row.prediction_timestamp,
      });
    }
  }

  return { live, upcoming, finished, predictions, error: null, at: new Date().toISOString() };
});
