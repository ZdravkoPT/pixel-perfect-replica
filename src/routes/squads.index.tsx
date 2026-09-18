import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { listTeams } from "@/lib/intel.functions";

export const Route = createFileRoute("/squads/")({
  head: () => ({
    meta: [
      { title: "Squads | Football Intelligence" },
      {
        name: "description",
        content:
          "Browse club squads with positions, shirt numbers, season stats and availability for every tracked team.",
      },
      { property: "og:title", content: "Squads | Football Intelligence" },
      {
        property: "og:description",
        content: "Club squads with positions, season stats and availability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SquadsPage,
});

function SquadsPage() {
  const [query, setQuery] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["teams", query],
    queryFn: () => listTeams({ data: { query, limit: 120 } }),
    placeholderData: keepPreviousData,
  });

  const teams = data?.teams ?? [];

  return (
    <AppShell title="Squads" subtitle="Pick a club to see its current squad and season numbers.">
      <div className="space-y-6">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search club…"
          className="max-w-md"
        />

        {teams.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {isFetching ? "Searching…" : "No clubs found."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <Link
                key={team.id}
                to="/squads/$teamId"
                params={{ teamId: team.id }}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
              >
                {team.crest_url ? (
                  <img src={team.crest_url} alt="" className="h-8 w-8 object-contain" />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{team.name}</p>
                  <p className="text-xs text-muted-foreground">{team.country ?? "—"}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
