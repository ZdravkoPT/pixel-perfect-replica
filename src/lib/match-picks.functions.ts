import { createServerFn } from "@tanstack/react-start";

type Picks = Awaited<ReturnType<typeof import("./match-picks.server").computeMatchPicks>>;

/** Returns the stored picks (refreshed hourly); recomputes if the store is stale. */
export const getMatchPicks = createServerFn({ method: "GET" }).handler(async (): Promise<Picks> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("match_picks_cache").select("payload, computed_at").eq("id", "latest").maybeSingle();
  if (data && Date.now() - new Date(data.computed_at).getTime() < 75 * 60_000) return data.payload as unknown as Picks;
  const { refreshMatchPicks } = await import("./match-picks.server");
  return refreshMatchPicks();
});
