import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { getValueBoard } from "@/lib/value.functions";

const boardQuery = queryOptions({
  queryKey: ["value-board"],
  queryFn: () => getValueBoard({ data: {} }),
});

export const Route = createFileRoute("/value")({
  head: () => ({
    meta: [
      { title: "Value Board | Football Intelligence" },
      {
        name: "description",
        content:
          "Model fair odds for every upcoming fixture and player projection, with how each price drifts as kickoff approaches.",
      },
      { property: "og:title", content: "Value Board | Football Intelligence" },
      {
        property: "og:description",
        content: "Fair odds per fixture and player projection, with pre-kickoff price drift.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(boardQuery),
  component: ValuePage,
});

function ValuePage() {
  const { data } = useSuspenseQuery(boardQuery);

  return (
    <AppShell title="Value board" subtitle="Model fair odds and pre-kickoff drift">
      <div className="space-y-6">
        <p className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
          No bookmaker feed is connected, so every price here is the model&apos;s own fair odds
          (1 / probability). &quot;Drift&quot; compares the latest repricing with the first one for
          the same fixture, so you can see how the projection moves as team news lands in the hour
          before kickoff.
        </p>

        {data.matches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No upcoming fixtures priced yet.
          </div>
        ) : (
          data.matches.map((match) => (
            <div key={match.matchId} className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link
                    to="/matches/$matchId"
                    params={{ matchId: match.matchId }}
                    className="text-sm font-semibold hover:text-primary"
                  >
                    {match.homeName} vs {match.awayName}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {match.league} · {new Date(match.kickoffAt).toLocaleString()}
                  </p>
                </div>
                <Badge variant="outline">
                  {match.revisions} reprice{match.revisions === 1 ? "" : "s"}
                  {match.confidence !== null ? ` · ${(match.confidence * 100).toFixed(0)}% conf` : ""}
                </Badge>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {match.selections.map((row) => (
                  <div key={row.key} className="rounded border border-border px-3 py-2">
                    <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                      {row.label}
                    </p>
                    <p className="mt-1 font-mono text-sm tabular-nums">{row.fairOdds.toFixed(2)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {(row.probability * 100).toFixed(1)}% ·{" "}
                      <span
                        className={
                          Math.abs(row.drift) < 0.01
                            ? "text-muted-foreground"
                            : row.drift > 0
                              ? "text-destructive"
                              : "text-primary"
                        }
                      >
                        {row.drift > 0 ? "+" : ""}
                        {row.drift.toFixed(2)}
                      </span>
                    </p>
                  </div>
                ))}
              </div>

              {match.props.length > 0 ? (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Player projections
                    </p>
                    <Badge
                      variant={match.lineupStatus === "confirmed" ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {match.lineupStatus === "confirmed"
                        ? "Confirmed T-60 XI"
                        : match.lineupStatus === "projected"
                          ? "Projected XI"
                          : "No team sheet"}
                    </Badge>
                    {match.lineupUpdatedAt ? (
                      <span className="text-[10px] text-muted-foreground">
                        updated {new Date(match.lineupUpdatedAt).toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {match.props.map((prop) => (
                      <div
                        key={`${prop.player}-${prop.market}-${prop.selection}`}
                        className="rounded border border-border px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {prop.player}
                            <span className="ml-1 text-muted-foreground">
                              {prop.selection.replace(/_/g, " ")}
                            </span>
                          </span>
                          <span className="ml-2 shrink-0 font-mono tabular-nums">
                            {(prop.probability * 100).toFixed(0)}% · {prop.fairOdds.toFixed(2)}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {prop.expectedMinutes !== null
                            ? `${Math.round(prop.expectedMinutes)}′ expected`
                            : "minutes unknown"}
                          {prop.startProbability !== null
                            ? ` · ${(prop.startProbability * 100).toFixed(0)}% to start`
                            : ""}
                          {prop.position ? ` · ${prop.position}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-[11px] text-muted-foreground">
                  No player projections — waiting for the T-60 team sheet for this fixture.
                </p>
              )}

            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
