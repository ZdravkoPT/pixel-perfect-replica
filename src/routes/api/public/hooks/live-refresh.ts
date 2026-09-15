import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * In-play refresh: pulls the live score, clock and red cards for every fixture
 * currently on the pitch, re-scores the model for the remaining minutes and
 * grades finished AI picks.
 */
export const Route = createFileRoute("/api/public/hooks/live-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const url = new URL(request.url);
        const limit = Number(url.searchParams.get("limit") ?? "40");

        const { runInPlayRefresh } = await import("@/lib/inplay.server");
        const result = await runInPlayRefresh({ limit: Number.isFinite(limit) ? limit : 40 });
        return Response.json(result);
      },
    },
  },
});
