import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { listReferees } from "@/lib/referees.functions";

const q = queryOptions({ queryKey: ["referees"], queryFn: () => listReferees(), staleTime: 10 * 60_000 });

export const Route = createFileRoute("/referees/")({
  head: () => ({
    meta: [
      { title: "Referees · AI Football Intelligence" },
      { name: "description", content: "Referees with stored matches: card rates, fouls and home-win share." },
      { property: "og:title", content: "Referees · AI Football Intelligence" },
      { property: "og:description", content: "Referee profiles built from real stored match data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: RefereesPage,
});

function RefereesPage() {
  const { data } = useSuspenseQuery(q);
  return (
    <AppShell title="Referees" subtitle={`${data.length} referees with stored matches`}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((r) => (
          <Link key={r.id} to="/referees/$refereeId" params={{ refereeId: r.id }} className="rounded-lg border border-border bg-card p-3 hover:border-primary">
            <div className="text-sm font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.country ?? "Country unknown"} · {r.matches} matches</div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
