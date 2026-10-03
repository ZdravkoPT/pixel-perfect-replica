import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Weekly recompute of squad market values from current squads. */
export const Route = createFileRoute("/api/public/hooks/market-values")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { computeSquadValues } = await import("@/lib/market-values.server");
        return Response.json(await computeSquadValues());
      },
    },
  },
});
