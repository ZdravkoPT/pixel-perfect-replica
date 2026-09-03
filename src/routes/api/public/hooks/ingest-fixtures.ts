import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/hooks/ingest-fixtures")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { ingestFixtures } = await import("@/lib/ingest.server");
        const summary = await ingestFixtures({ days: 7, triggeredBy: "cron" });
        return Response.json(summary);
      },
    },
  },
});
