import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled import of real team box-score stats for finished fixtures. */
export const Route = createFileRoute("/api/public/hooks/match-stats")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 40) || 40, 300);
        const { ingestMatchStats, backfillXg } = await import("@/lib/match-stats.server");
        const stats = await ingestMatchStats({ limit, triggeredBy: "cron", budgetMs: 70_000 });
        const xg = await backfillXg({ limit, budgetMs: 25_000 });
        return Response.json({ ...stats, xg });
      },
    },
  },
});
