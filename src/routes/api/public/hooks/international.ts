import { createFileRoute } from "@tanstack/react-router";
import { authenticateJob as authenticateCronRequest } from "@/lib/cron-guard.server";

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
