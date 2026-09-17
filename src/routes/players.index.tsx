import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { searchPlayers } from "@/lib/intel.functions";

export const Route = createFileRoute("/players")({
  head: () => ({
    meta: [
      { title: "Player Directory | Football Intelligence" },
      {
        name: "description",
        content:
          "Search current squads across Europe's top leagues with positions, shirt numbers and club affiliations.",
      },
      { property: "og:title", content: "Player Directory | Football Intelligence" },
      {
        property: "og:description",
        content: "Search current squads across Europe's top leagues with positions and shirt numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlayersPage,
});

type Row = {
  id: string;
  shirt_number: number | null;
  position: string | null;
  player: { id: string; name: string; position: string | null; nationality: string | null; birth_date: string | null } | null;
  team: { id: string; name: string; crest_url: string | null } | null;
};

function PlayersPage() {
  const [query, setQuery] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["players", query],
    queryFn: () => searchPlayers({ data: { query, limit: 60 } }),
    placeholderData: keepPreviousData,
  });

  const rows = (data?.players ?? []) as unknown as Row[];

  return (
    <AppShell title="Players">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Player directory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Current squad memberships ingested from official competition feeds.
          </p>
        </div>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by player name…"
          className="max-w-md"
        />

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {isFetching ? "Searching…" : "No players found. Run a squad sync from the admin page."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <Link
                key={row.id}
                to="/players/$playerId"
                params={{ playerId: row.player?.id ?? "" }}
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{row.player?.name ?? "Unknown"}</p>
                  <Badge variant="secondary">{row.shirt_number ?? "—"}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.team?.name ?? "Free agent"} · {row.position ?? row.player?.position ?? "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.player?.nationality ?? "Unknown nationality"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
