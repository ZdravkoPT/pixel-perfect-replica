import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { MatchCard, type MatchCardData } from "@/components/MatchCard";
import { Input } from "@/components/ui/input";
import { listMatches } from "@/lib/football.functions";
import { listTopPredictions } from "@/lib/analytics.functions";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";

const matchesQuery = queryOptions({
  queryKey: ["matches", 7],
  queryFn: () => listMatches({ data: { days: 7 } }),
});

const picksQuery = queryOptions({
  queryKey: ["top-picks"],
  queryFn: () => listTopPredictions({ data: { limit: 6 } }),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today's Fixtures — Football Intelligence" },
      {
        name: "description",
        content:
          "Live and upcoming football fixtures across Europe's top leagues, aggregated from multiple data providers.",
      },
      { property: "og:title", content: "Today's Fixtures — Football Intelligence" },
      {
        property: "og:description",
        content: "Live and upcoming fixtures from multiple football data providers.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(matchesQuery);
  },
  component: Dashboard,
});

function Dashboard() {
  const { data } = useSuspenseQuery(matchesQuery);
  const picks = useQuery(picksQuery);
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState("all");

  const matches = (data.matches ?? []) as unknown as MatchCardData[];

  const leagues = useMemo(() => {
    const names = new Set<string>();
    for (const match of matches) if (match.league?.name) names.add(match.league.name);
    return Array.from(names).sort();
  }, [matches]);

  const filtered = matches.filter((match) => {
    if (league !== "all" && match.league?.name !== league) return false;
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      (match.home?.name ?? "").toLowerCase().includes(term) ||
      (match.away?.name ?? "").toLowerCase().includes(term) ||
      (match.league?.name ?? "").toLowerCase().includes(term)
    );
  });

  const grouped = filtered.reduce<Record<string, MatchCardData[]>>((acc, match) => {
    const day = new Date(match.kickoff_at).toLocaleDateString([], {
      weekday: "long",
      day: "2-digit",
      month: "short",
    });
    (acc[day] ??= []).push(match);
    return acc;
  }, {});

  return (
    <AppShell
      title="Fixtures"
      subtitle={`${filtered.length} matches over the next 7 days · model confidence from the Elo + Dixon-Coles engine`}
    >
      {(picks.data?.picks ?? []).length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Highest model confidence
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(picks.data?.picks ?? []).map((pick) => {
              const match = pick.match as unknown as {
                kickoff_at: string;
                home: { name: string } | null;
                away: { name: string } | null;
                league: { name: string } | null;
              } | null;
              const probs = [
                { label: match?.home?.name ?? "Home", value: Number(pick.p_home) },
                { label: "Draw", value: Number(pick.p_draw) },
                { label: match?.away?.name ?? "Away", value: Number(pick.p_away) },
              ];
              const best = probs.reduce((a, b) => (b.value > a.value ? b : a));
              return (
                <Link
                  key={pick.id}
                  to="/matches/$matchId"
                  params={{ matchId: pick.match_id }}
                  className="rounded-lg border border-primary/30 bg-card p-4 transition-colors hover:border-primary"
                >
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{match?.league?.name ?? "Unknown league"}</span>
                    <Badge variant="outline">
                      {(Number(pick.confidence ?? 0) * 100).toFixed(0)}% conf.
                    </Badge>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium">
                    {match?.home?.name ?? "TBD"} vs {match?.away?.name ?? "TBD"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pick: <span className="text-foreground">{best.label}</span>{" "}
                    {(best.value * 100).toFixed(1)}% · xG total{" "}
                    {Number(pick.expected_goals).toFixed(2)} · likely {pick.top_scoreline ?? "–"}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search teams or leagues…"
          className="max-w-xs"
        />
        <select
          value={league}
          onChange={(event) => setLeague(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All leagues</option>
          {leagues.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {data.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {data.error}
        </p>
      ) : null}

      {matches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No fixtures stored yet. Run a sync from Diagnostics to ingest the next 7 days.
        </p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, dayMatches]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {day}
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {dayMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
