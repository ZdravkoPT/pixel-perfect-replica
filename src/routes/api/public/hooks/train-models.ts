import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/hooks/train-models")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { runAnalytics } = await import("@/lib/analytics.server");
        const summary = await runAnalytics({ triggeredBy: "cron" });
        return Response.json(summary);
      },
    },
  },
});
