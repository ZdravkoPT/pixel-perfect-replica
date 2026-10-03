import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Weekly: attach Understat match xG to stored league history. */
export const Route = createFileRoute("/api/public/hooks/understat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { importUnderstat } = await import("@/lib/understat.server");
        return Response.json(await importUnderstat({ budgetMs: 100_000 }));
      },
    },
  },
});
