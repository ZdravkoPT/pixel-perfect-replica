import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getLeagueDetail, type Leader } from "@/lib/leagues.functions";

const leagueQuery = (leagueId: string) =>
  queryOptions({ queryKey: ["league", leagueId], queryFn: () => getLeagueDetail({ data: { leagueId } }) });

export const Route = createFileRoute("/leagues/$leagueId")({
  head: () => ({
    meta: [
      { title: "League table & leaders | Football Intelligence" },
      { name: "description", content: "Standings, top scorers, assists, cards and team of the week for this competition." },
      { property: "og:title", content: "League table & leaders | Football Intelligence" },
      { property: "og:description", content: "Standings, player leaders and team of the week." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(leagueQuery(params.leagueId)),
  component: LeaguePage,
});

const formCls: Record<string, string> = { W: "bg-primary text-primary-foreground", D: "bg-muted text-foreground", L: "bg-destructive text-destructive-foreground" };

function LeaderList({ title, rows, unit }: { title: string; rows: Leader[]; unit: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      {rows.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No player stats stored yet.</p> : (
        <ol className="mt-3 space-y-1.5 text-sm">
          {rows.map((r, i) => (
            <li key={r.playerId} className="flex items-center justify-between gap-2">
              <Link to="/players/$playerId" params={{ playerId: r.playerId }} className="truncate hover:underline">
                <span className="mr-2 text-muted-foreground">{i + 1}.</span>{r.name}
                {r.team && <span className="ml-1 text-xs text-muted-foreground">· {r.team}</span>}
              </Link>
              <span className="font-mono tabular-nums">{r.value}<span className="ml-1 text-xs text-muted-foreground">{unit}</span></span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LeaguePage() {
  const { leagueId } = Route.useParams();
  const { data } = useSuspenseQuery(leagueQuery(leagueId));
  if (!data.league) return <AppShell title="League not found"><p className="text-sm text-muted-foreground">This competition is not in the database.</p></AppShell>;
  return (
    <AppShell title={data.league.name} subtitle={`${data.season ? `Season ${data.season} · ` : ""}${data.matches} finished matches stored`}>
      <div className="space-y-6">
        <Link to="/leagues" className="text-xs text-muted-foreground hover:underline">← All leagues</Link>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          {data.standings.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No finished league games stored for this season yet.</p> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2 text-left">#</th><th className="p-2 text-left">Team</th>
                  {["P", "W", "D", "L", "GF", "GA", "GD", "Pts"].map((h) => <th key={h} className="p-2 text-right">{h}</th>)}
                  <th className="p-2 text-left">Form</th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((r, i) => (
                  <tr key={r.teamId} className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                    <td className="p-2">
                      <Link to="/teams/$teamId" params={{ teamId: r.teamId }} className="flex items-center gap-2 hover:underline">
                        {r.crest && <img src={r.crest} alt="" className="h-4 w-4 object-contain" />}{r.name}
                      </Link>
                    </td>
                    {[r.p, r.w, r.d, r.l, r.gf, r.ga, r.gf - r.ga].map((v, j) => <td key={j} className="p-2 text-right tabular-nums">{v}</td>)}
                    <td className="p-2 text-right font-semibold tabular-nums">{r.pts}</td>
                    <td className="p-2"><div className="flex gap-0.5">{r.form.map((f, j) => <span key={j} className={`grid h-5 w-5 place-items-center rounded text-[10px] ${formCls[f]}`}>{f}</span>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <LeaderList title="Top scorers" rows={data.scorers} unit="G" />
          <LeaderList title="Top assists" rows={data.assists} unit="A" />
          <LeaderList title="Cards (red = 2)" rows={data.cards} unit="pts" />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Team of the week{data.totwWeek ? ` · week ending ${new Date(data.totwWeek).toLocaleDateString()}` : ""}
          </p>
          {data.totw.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No player ratings stored for this league yet.</p> : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {data.totw.map((p) => (
                <Link key={p.playerId} to="/players/$playerId" params={{ playerId: p.playerId }} className="flex items-center justify-between rounded border border-border p-2 text-sm hover:bg-accent">
                  <span className="truncate"><span className="mr-2 font-mono text-xs text-muted-foreground">{p.position}</span>{p.name}</span>
                  <span className="font-mono tabular-nums">{p.rating.toFixed(1)}</span>
                </Link>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">Best rated player per line (45+ min). Only real ratings — empty spots stay empty.</p>
        </div>
      </div>
    </AppShell>
  );
}
