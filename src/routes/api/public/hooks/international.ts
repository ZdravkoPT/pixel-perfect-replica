import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Weekly import of international match results (national-team history). */
export const Route = createFileRoute("/api/public/hooks/international")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { importInternational } = await import("@/lib/history.server");
        return Response.json(await importInternational());
      },
    },
  },
});
