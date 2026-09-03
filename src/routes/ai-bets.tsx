import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getAiBets } from "@/lib/value.functions";

const betsQuery = queryOptions({
  queryKey: ["ai-bets"],
  queryFn: () => getAiBets({ data: {} }),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/ai-bets")({
  head: () => ({
    meta: [
      { title: "AI Bet Builder — Today's Strongest Signals" },
      {
        name: "description",
        content:
          "Today's highest-confidence model selections across every covered league, with an AI-written singles and bet-builder brief.",
      },
      { property: "og:title", content: "AI Bet Builder — Today's Strongest Signals" },
      {
        property: "og:description",
        content: "Today's highest-confidence model selections with an AI singles and bet-builder brief.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(betsQuery),
  component: AiBetsPage,
});

function AiBetsPage() {
  const { data } = useSuspenseQuery(betsQuery);

  return (
    <AppShell title="AI bet builder" subtitle="Strongest model signals kicking off today">
      <div className="space-y-6">
        {data.candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {data.reason === "no-fixtures"
              ? "No fixtures left today. Check back tomorrow or browse the value board."
              : "No selection today clears the confidence threshold — the model is not strong anywhere."}
          </div>
        ) : (
          <>
            {data.brief ? (
              <article className="rounded-lg border border-border bg-card p-5 text-sm leading-relaxed">
                {data.brief.split("\n").map((line, index) => {
                  const text = line.replace(/^[#*\-\s]+/, "").replace(/\*\*/g, "");
                  if (!text) return null;
                  const isHeading = line.trim().startsWith("#") || /^\*\*.+\*\*$/.test(line.trim());
                  const isBullet = /^\s*[-*]\s/.test(line);
                  if (isHeading) {
                    return (
                      <h2 key={index} className="mt-4 text-sm font-semibold first:mt-0">
                        {text}
                      </h2>
                    );
                  }
                  return (
                    <p
                      key={index}
                      className={isBullet ? "mt-1 pl-4 text-xs text-muted-foreground" : "mt-2 text-xs"}
                    >
                      {isBullet ? `• ${text}` : text}
                    </p>
                  );
                })}
              </article>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                The AI brief is temporarily unavailable — the ranked signals below are unaffected.
              </p>
            )}

            <section>
              <h2 className="text-sm font-semibold">Ranked signals</h2>
              <div className="mt-3 space-y-2">
                {data.candidates.map((row, index) => (
                  <div key={`${row.matchId}-${row.selection}-${index}`} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{row.selection}</p>
                        <Link
                          to="/matches/$matchId"
                          params={{ matchId: row.matchId }}
                          className="text-xs text-muted-foreground hover:text-primary"
                        >
                          {row.fixture} · {row.league} ·{" "}
                          {new Date(row.kickoffAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Link>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={row.kind === "player" ? "secondary" : "outline"}>
                          {row.kind === "player" ? "Player" : "Match"}
                        </Badge>
                        <span className="font-mono text-sm tabular-nums">
                          {(row.probability * 100).toFixed(1)}% · {row.fairOdds.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <Progress value={row.probability * 100} className="mt-3 h-1.5" />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Fair odds are 1 / model probability. No bookmaker feed is connected, so these are not
          value calls against a market price. Bet responsibly; nothing here guarantees a return.
        </p>
      </div>
    </AppShell>
  );
}
