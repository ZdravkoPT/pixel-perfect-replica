import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Backfills FotMob player profiles (incl. market values) in batches. */
export const Route = createFileRoute("/api/public/hooks/player-careers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 200) || 200, 400);
        const { ingestPlayerCareers } = await import("@/lib/attributes.server");
        return Response.json(await ingestPlayerCareers({ maxProfiles: limit, triggeredBy: "cron" }));
      },
    },
  },
});
