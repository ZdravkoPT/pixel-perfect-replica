import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Weekly self-review: walk-forward grades the last N weeks of model picks so
 * the bet builder keeps re-calibrating on its own results.
 */
export const Route = createFileRoute("/api/public/hooks/bet-review")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const url = new URL(request.url);
        const weeks = Number(url.searchParams.get("weeks") ?? "10");

        const { runBetHistory } = await import("@/lib/bet-history.server");
        const summary = await runBetHistory({
          weeks: Number.isFinite(weeks) ? weeks : 10,
          triggeredBy: "cron",
        });
        return Response.json(summary);
      },
    },
  },
});
