import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getHeadToHead } from "@/lib/referees.functions";

const q = (teamA: string, teamB: string) => queryOptions({ queryKey: ["h2h", teamA, teamB], queryFn: () => getHeadToHead({ data: { teamA, teamB } }), staleTime: 10 * 60_000 });

export const Route = createFileRoute("/h2h/$teamA/$teamB")({
  head: () => ({
    meta: [
      { title: "Head-to-head · AI Football Intelligence" },
      { name: "description", content: "Every stored meeting between two teams: wins, goals, over 2.5 and both-teams-score rates." },
      { property: "og:title", content: "Head-to-head · AI Football Intelligence" },
      { property: "og:description", content: "Full head-to-head record from real match history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(q(params.teamA, params.teamB)),
  component: H2hPage,
});

function H2hPage() {
  const { teamA, teamB } = Route.useParams();
  const { data } = useSuspenseQuery(q(teamA, teamB));
  const an = data.teamA?.name ?? "Team A", bn = data.teamB?.name ?? "Team B";
  const s = data.summary;
  return (
    <AppShell title={`${an} vs ${bn}`} subtitle={`Head-to-head · ${data.games.length} stored meetings`}>
      <div className="space-y-6">
        {!s ? <p className="text-sm text-muted-foreground">No finished meetings between these teams are stored.</p> : (
          <>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between text-sm">
                <Link to="/teams/$teamId" params={{ teamId: teamA }} className="font-medium hover:underline">{an}</Link>
                <Link to="/teams/$teamId" params={{ teamId: teamB }} className="font-medium hover:underline">{bn}</Link>
              </div>
              <div className="mt-3 flex h-3 overflow-hidden rounded">
                <div className="bg-primary" style={{ width: `${(s.aWins / data.games.length) * 100}%` }} />
                <div className="bg-muted" style={{ width: `${(s.draws / data.games.length) * 100}%` }} />
                <div className="bg-accent" style={{ width: `${(s.bWins / data.games.length) * 100}%` }} />
              </div>
              <div className="mt-2 grid grid-cols-3 text-center text-xs">
                <div><b className="text-base tabular-nums">{s.aWins}</b><div className="text-muted-foreground">wins</div></div>
                <div><b className="text-base tabular-nums">{s.draws}</b><div className="text-muted-foreground">draws</div></div>
                <div><b className="text-base tabular-nums">{s.bWins}</b><div className="text-muted-foreground">wins</div></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
                <div>Goals {s.aGoals}–{s.bGoals}</div>
                <div>Over 2.5: {Math.round(s.over25 * 100)}%</div>
                <div>Both scored: {Math.round(s.btts * 100)}%</div>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <tbody>
                  {data.games.map((g, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="p-2 text-xs text-muted-foreground">{new Date(g.date).toLocaleDateString()}</td>
                      <td className="p-2 text-xs text-muted-foreground">{g.league}</td>
                      <td className="p-2 text-right">{g.home}</td>
                      <td className="p-2 text-center font-semibold tabular-nums">{g.matchId ? <Link to="/matches/$matchId" params={{ matchId: g.matchId }} className="hover:underline">{g.hg}–{g.ag}</Link> : `${g.hg}–${g.ag}`}</td>
                      <td className="p-2">{g.away}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
