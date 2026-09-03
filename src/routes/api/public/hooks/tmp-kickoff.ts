import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tmp-kickoff")({
  server: {
    handlers: {
      GET: async () => {
        const { runKickoffRefresh } = await import("@/lib/kickoff.server");
        return Response.json(
          await runKickoffRefresh({ triggeredBy: "manual", windowMinutes: 240 }),
        );
      },
    },
  },
});
