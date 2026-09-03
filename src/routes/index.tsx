import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { MatchCard, type MatchCardData } from "@/components/MatchCard";
import { Input } from "@/components/ui/input";
import { listMatches } from "@/lib/football.functions";

const matchesQuery = queryOptions({
  queryKey: ["matches", 7],
  queryFn: () => listMatches({ data: { days: 7 } }),
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
      subtitle={`${filtered.length} matches over the next 7 days · value picks and model confidence arrive in Phase 2`}
    >
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
