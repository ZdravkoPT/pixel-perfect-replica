import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled bookmaker-odds snapshot import (pre-match, T-60, closing). */
export const Route = createFileRoute("/api/public/hooks/odds-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { ingestOdds } = await import("@/lib/odds.server");
        return Response.json(await ingestOdds());
      },
    },
  },
});
