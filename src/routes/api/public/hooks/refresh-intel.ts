import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled player-intelligence refresh: rebuilds projected line-ups,
 * expected minutes, corner/card markets and player props for upcoming matches.
 */
export const Route = createFileRoute("/api/public/hooks/refresh-intel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const url = new URL(request.url);
        const withSquads = url.searchParams.get("squads") === "1";

        const { ingestSquads, ingestOfficials, runIntel } = await import("@/lib/intel.server");
        const squads = withSquads ? await ingestSquads({ triggeredBy: "cron" }) : null;
        const officials = await ingestOfficials({ triggeredBy: "cron", limit: 2000 });
        const intel = await runIntel({ triggeredBy: "cron" });

        // Grow player-career coverage a batch per cycle (weekly staleness window
        // inside ingestPlayerCareers keeps this cheap once coverage is complete).
        const { ingestPlayerCareers } = await import("@/lib/attributes.server");
        const careers = await ingestPlayerCareers({ maxProfiles: 40, triggeredBy: "cron" });

        // Manager dossiers and player condition snapshots, a batch per cycle.
        const { ingestCoachProfiles, ingestPlayerConditions } = await import(
          "@/lib/coach-intel.server"
        );
        const coachProfiles = await ingestCoachProfiles({ maxTeams: 60, triggeredBy: "cron" });
        const conditions = await ingestPlayerConditions({ maxPlayers: 120, triggeredBy: "cron" });

        return Response.json({ squads, officials, intel, careers, coachProfiles, conditions });
      },
    },
  },
});
