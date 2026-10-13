import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Every 15 minutes: fetch RSS feeds, store new articles, tag a small batch with AI. */
export const Route = createFileRoute("/api/public/hooks/news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { refreshNews } = await import("@/lib/news.server");
        return Response.json(await refreshNews());
      },
    },
  },
});
