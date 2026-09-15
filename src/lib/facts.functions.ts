import { createServerFn } from "@tanstack/react-start";
import type { MatchFacts } from "./providers/fotmob.server";

/**
 * Match facts for one fixture. The public FotMob feed supplies the live picture
 * (referee, stadium, match stats, timeline) when it covers the game, and our own
 * archive always supplies form, scoring profile and head-to-head so every match
 * has a facts panel.
 */
export const getMatchFacts = createServerFn({ method: "GET" })
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { FotmobProvider } = await import("./providers/fotmob.server");
    const { buildLocalFacts } = await import("./facts.server");

    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("id, kickoff_at, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) return { facts: null, local: null, error: "Fixture not found" };

    const home = (match as unknown as { home: { name: string } | null }).home?.name ?? "";
    const away = (match as unknown as { away: { name: string } | null }).away?.name ?? "";

    const local = await buildLocalFacts(data.matchId).catch(() => null);

    const { data: source } = await supabaseAdmin
      .from("match_sources")
      .select("provider_match_id")
      .eq("match_id", data.matchId)
      .eq("source_id", "fotmob")
      .maybeSingle();

    const fotmob = new FotmobProvider();
    let providerId = source?.provider_match_id ?? null;
    if (!providerId) {
      providerId = await fotmob.findMatchId(match.kickoff_at, home, away);
      if (providerId) {
        await supabaseAdmin
          .from("match_sources")
          .insert({ match_id: data.matchId, source_id: "fotmob", provider_match_id: providerId });
      }
    }

    let facts: MatchFacts | null = null;
    let error: string | null = null;
    if (providerId) {
      const result = await fotmob.getMatchFacts(providerId);
      if (result.ok) facts = result.data;
      else error = result.error;
    } else {
      error = "No live feed covers this fixture yet";
    }

    return { facts, local, error, homeName: home, awayName: away };
  });
