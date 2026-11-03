import { createFileRoute } from "@tanstack/react-router";
import { authenticateJob as authenticateCronRequest } from "@/lib/cron-guard.server";

export const Route = createFileRoute("/api/public/hooks/elo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { importElo } = await import("@/lib/elo.server");
        return Response.json(await importElo());
      },
    },
  },
});
