import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Hourly: settle finished picks, then recompute and store today's match picks. */
export const Route = createFileRoute("/api/public/hooks/match-picks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { settlePendingPicks } = await import("@/lib/bet-log.server");
        const settled = await settlePendingPicks();
        const { refreshMatchPicks } = await import("@/lib/match-picks.server");
        const r = await refreshMatchPicks();
        return Response.json({ settled, picks: r.picks.length, noBets: r.noBets.length });
      },
    },
  },
});
