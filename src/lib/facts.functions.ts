import { createServerFn } from "@tanstack/react-start";

/**
 * Live match facts for one fixture (referee, stadium, team form, match stats
 * and the goal/card/substitution timeline) pulled from the public FotMob feed.
 */
export const getMatchFacts = createServerFn({ method: "GET" })
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { FotmobProvider } = await import("./providers/fotmob.server");

    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("id, kickoff_at, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) return { facts: null, error: "Fixture not found" };

    const { data: source } = await supabaseAdmin
      .from("match_sources")
      .select("provider_match_id")
      .eq("match_id", data.matchId)
      .eq("source_id", "fotmob")
      .maybeSingle();

    const fotmob = new FotmobProvider();
    const home = (match as unknown as { home: { name: string } | null }).home?.name ?? "";
    const away = (match as unknown as { away: { name: string } | null }).away?.name ?? "";
    let providerId = source?.provider_match_id ?? null;
    if (!providerId) {
      providerId = await fotmob.findMatchId(match.kickoff_at, home, away);
      if (providerId) {
        await supabaseAdmin
          .from("match_sources")
          .insert({ match_id: data.matchId, source_id: "fotmob", provider_match_id: providerId });
      }
    }
    if (!providerId) return { facts: null, error: "No live data source for this fixture yet" };

    const facts = await fotmob.getMatchFacts(providerId);
    if (!facts.ok) return { facts: null, error: facts.error };
    return { facts: facts.data, error: null, homeName: home, awayName: away };
  });
