import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Weekly walk-forward competition between goal models over league history. */
export const Route = createFileRoute("/api/public/hooks/model-competition")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { runModelCompetition } = await import("@/lib/model-competition.server");
        return Response.json(await runModelCompetition({ triggeredBy: "cron" }));
      },
    },
  },
});
