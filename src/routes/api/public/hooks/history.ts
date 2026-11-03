import { createFileRoute } from "@tanstack/react-router";
import { authenticateJob as authenticateCronRequest } from "@/lib/cron-guard.server";

export const Route = createFileRoute("/api/public/hooks/history")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { importHistory, importOpenfootball } = await import("@/lib/history.server");
        const main = await importHistory();
        const lower = await importOpenfootball();
        return Response.json({ ...main, openfootball: lower });
      },
    },
  },
});
