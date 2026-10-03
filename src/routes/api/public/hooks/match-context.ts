import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Hourly: stadium locations, kickoff weather forecasts and away travel distance. */
export const Route = createFileRoute("/api/public/hooks/match-context")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { refreshMatchContext } = await import("@/lib/match-context.server");
        return Response.json(await refreshMatchContext({ budgetMs: 95_000 }));
      },
    },
  },
});
