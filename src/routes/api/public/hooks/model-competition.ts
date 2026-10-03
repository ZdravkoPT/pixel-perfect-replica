import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Weekly walk-forward competition between goal models over league history. */
export const Route = createFileRoute("/api/public/hooks/model-competition")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;
        const { runModelCompetition } = await import("@/lib/model-competition.server");
        const url = new URL(request.url);
        const { trainShotModel } = await import("@/lib/shot-xg.server");
        if (url.searchParams.get("only") === "shot_xg") return Response.json(await trainShotModel());
        const result = await runModelCompetition({ triggeredBy: "cron" });
        const shotXg = await trainShotModel().catch((e) => ({ ok: false, reason: String(e) }));
        return Response.json({ ...result, shotXg });
      },
    },
  },
});
