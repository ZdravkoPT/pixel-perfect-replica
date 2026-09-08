import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { StakeCalculator, StakeSettings, type StakeInputs } from "@/components/StakeCalculator";
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
  const [settings, setSettings] = useState<StakeInputs>({ bankroll: 500, stake: 10, kellyFraction: 0.25 });

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

            {data.history ? (
              <section className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-sm font-semibold">
                  Past {data.history.weeks} weeks — graded record
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <Fact
                    label="Bets settled"
                    value={`${data.history.wins}/${data.history.picks}`}
                  />
                  <Fact
                    label="Hit rate"
                    value={`${((Number(data.history.hit_rate) || 0) * 100).toFixed(1)}%`}
                  />
                  <Fact
                    label="Model expected"
                    value={`${((Number(data.history.expected_hit_rate) || 0) * 100).toFixed(1)}%`}
                  />
                  <Fact
                    label="Return per unit"
                    value={`${((Number(data.history.roi_market) || 0) * 100).toFixed(1)}%`}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Today's percentages below are adjusted with this record, so markets that have been
                  over-optimistic are toned down automatically.
                </p>
              </section>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                No graded 10-week review has been run yet, so today's percentages are the raw model
                output.
              </p>
            )}

            {data.builder ? (
              <section className="rounded-lg border border-primary/40 bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Bet builder</h2>
                  <span className="font-mono text-sm tabular-nums">
                    {(data.builder.probability * 100).toFixed(1)}% ·{" "}
                    {data.builder.fairOdds.toFixed(2)}
                  </span>
                </div>
                <ul className="mt-3 space-y-1 text-xs">
                  {data.builder.legs.map((leg, index) => (
                    <li key={`${leg.matchId}-${index}`} className="flex justify-between gap-3">
                      <span>
                        {leg.selection}
                        <span className="ml-2 text-muted-foreground">{leg.fixture}</span>
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {(leg.probability * 100).toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
                <StakeCalculator
                  probability={data.builder.probability}
                  fairOdds={data.builder.fairOdds}
                  settings={settings}
                />
              </section>
            ) : null}

            <StakeSettings value={settings} onChange={setSettings} />

            {data.megaSlip ? (
              <section className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">
                    Mega slip — {data.megaSlip.legs.length} matches
                  </h2>
                  <span className="font-mono text-sm tabular-nums">
                    {(data.megaSlip.probability * 100).toFixed(2)}% ·{" "}
                    {data.megaSlip.fairOdds.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.megaSlip.marketMix.map((entry) => `${entry.count} ${entry.label.toLowerCase()}`).join(" · ")} ·
                  average leg {(data.megaSlip.averageProbability * 100).toFixed(1)}%. Every pick is
                  the best-priced call that still clears the safety floor after calibration.
                  A slip this long is very unlikely to land in full — most people play the legs
                  singly or in small combinations.
                </p>

                <div className="mt-4 space-y-2">
                  {data.megaSlip.legs.map((leg, index) => (
                    <div key={`${leg.matchId}-${index}`} className="rounded border border-border bg-background p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{leg.selection}</p>
                          <Link
                            to="/matches/$matchId"
                            params={{ matchId: leg.matchId }}
                            className="text-xs text-muted-foreground hover:text-primary"
                          >
                            {leg.fixture} · {leg.league} ·{" "}
                            {new Date(leg.kickoffAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Link>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={leg.market === "1x2" ? "outline" : "secondary"}>
                            {leg.marketLabel}
                          </Badge>

                          <span className="font-mono text-sm tabular-nums">
                            {(leg.probability * 100).toFixed(1)}% · {leg.fairOdds.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      {leg.opinion ? (
                        <p className="mt-2 text-xs text-muted-foreground">{leg.opinion}</p>
                      ) : null}
                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {leg.facts.map((fact, factIndex) => (
                          <li key={factIndex}>{fact}</li>
                        ))}
                      </ul>
                      <StakeCalculator
                        probability={leg.probability}
                        fairOdds={leg.fairOdds}
                        settings={settings}
                      />
                    </div>
                  ))}
                </div>
                <StakeCalculator
                  probability={data.megaSlip.probability}
                  fairOdds={data.megaSlip.fairOdds}
                  settings={settings}
                />
              </section>
            ) : null}


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
                    <StakeCalculator
                      probability={row.probability}
                      fairOdds={row.fairOdds}
                      settings={settings}
                    />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Fair odds are 1 / model probability. No bookmaker feed is connected, so enter your own
          bookmaker price to see the edge, profit and Kelly stake. Bet responsibly; nothing here
          guarantees a return.
        </p>
      </div>
    </AppShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

