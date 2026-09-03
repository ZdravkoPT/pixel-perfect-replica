import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listCoaches } from "@/lib/intel.functions";

export const Route = createFileRoute("/coaches")({
  head: () => ({
    meta: [
      { title: "Coach Directory | Football Intelligence" },
      {
        name: "description",
        content:
          "Every head coach in our covered leagues with their current club, previous spells and record in our match archive.",
      },
      { property: "og:title", content: "Coach Directory | Football Intelligence" },
      {
        property: "og:description",
        content: "Head coaches with current clubs, previous spells and archive records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CoachesPage,
});

type Row = {
  id: string;
  name: string;
  nationality: string | null;
  spells: Array<{ is_current: boolean; team: { id: string; name: string } | null }>;
};

function CoachesPage() {
  const [query, setQuery] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["coaches", query],
    queryFn: () => listCoaches({ data: { query, limit: 80 } }),
    placeholderData: keepPreviousData,
  });

  const rows = (data?.coaches ?? []) as unknown as Row[];

  return (
    <AppShell title="Coaches" subtitle="Current appointments and career history">
      <div className="space-y-6">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by coach name…"
          className="max-w-md"
        />

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {isFetching ? "Searching…" : "No coaches found. Run a squad sync from the admin page."}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((coach) => {
              const current = coach.spells.find((spell) => spell.is_current)?.team ?? null;
              const former = coach.spells.filter((spell) => !spell.is_current).length;
              return (
                <Link
                  key={coach.id}
                  to="/coaches/$coachId"
                  params={{ coachId: coach.id }}
                  className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{coach.name}</p>
                    {former > 0 ? <Badge variant="secondary">{former} past</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {current?.name ?? "No current club"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {coach.nationality ?? "Unknown nationality"}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
