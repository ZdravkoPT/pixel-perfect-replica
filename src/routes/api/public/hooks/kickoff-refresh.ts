import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * T-60 refresh: runs every few minutes, picks up fixtures kicking off within
 * the next hour, stores confirmed team sheets when the provider publishes them
 * and re-scores the AI prediction against the real availability picture.
 */
export const Route = createFileRoute("/api/public/hooks/kickoff-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const url = new URL(request.url);
        const windowMinutes = Number(url.searchParams.get("window") ?? "70");

        const { runKickoffRefresh } = await import("@/lib/kickoff.server");
        const result = await runKickoffRefresh({
          triggeredBy: "cron",
          windowMinutes: Number.isFinite(windowMinutes) ? windowMinutes : 70,
        });

        return Response.json(result);
      },
    },
  },
});
