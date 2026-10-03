import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getLeagues } from "@/lib/leagues.functions";

const leaguesQuery = queryOptions({ queryKey: ["leagues"], queryFn: () => getLeagues() });

export const Route = createFileRoute("/leagues/")({
  head: () => ({
    meta: [
      { title: "Leagues | Football Intelligence" },
      { name: "description", content: "Every tracked competition with tables, top scorers, assists, cards and team of the week." },
      { property: "og:title", content: "Leagues | Football Intelligence" },
      { property: "og:description", content: "League tables, player leaders and team of the week." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(leaguesQuery),
  component: LeaguesPage,
});

function LeaguesPage() {
  const { data } = useSuspenseQuery(leaguesQuery);
  return (
    <AppShell title="Leagues" subtitle="Tables and leaders built from the results stored in the app.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((l) => (
          <Link key={l.id} to="/leagues/$leagueId" params={{ leagueId: l.id }}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-accent">
            {l.logo_url ? <img src={l.logo_url} alt="" className="h-8 w-8 object-contain" /> : <div className="h-8 w-8 rounded bg-muted" />}
            <div>
              <p className="text-sm font-medium">{l.name}</p>
              <p className="text-xs text-muted-foreground">{l.country ?? "International"}</p>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
