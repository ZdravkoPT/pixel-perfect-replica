import { createFileRoute } from "@tanstack/react-router";
import { authenticateJob as authenticateCronRequest } from "@/lib/cron-guard.server";

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
