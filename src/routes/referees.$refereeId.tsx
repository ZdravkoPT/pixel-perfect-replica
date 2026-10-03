import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getReferee } from "@/lib/referees.functions";

const q = (refereeId: string) => queryOptions({ queryKey: ["referee", refereeId], queryFn: () => getReferee({ data: { refereeId } }), staleTime: 10 * 60_000 });

export const Route = createFileRoute("/referees/$refereeId")({
  head: () => ({
    meta: [
      { title: "Referee profile · AI Football Intelligence" },
      { name: "description", content: "Cards, fouls and results in every stored match this referee officiated." },
      { property: "og:title", content: "Referee profile · AI Football Intelligence" },
      { property: "og:description", content: "Referee card and foul rates from real match data." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(q(params.refereeId)),
  component: RefereePage,
});

function Stat({ label, value, note }: { label: string; value: string; note?: string | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}

function RefereePage() {
  const { refereeId } = Route.useParams();
  const { data } = useSuspenseQuery(q(refereeId));
  if (!data.referee) return <AppShell title="Referee not found"><p className="text-sm text-muted-foreground">This referee is not in the database.</p></AppShell>;
  const s = data.summary!;
  const fmt = (x: { value: number; n: number } | null, d = 2) => (x ? x.value.toFixed(d) : "—");
  return (
    <AppShell title={data.referee.name} subtitle={`${data.referee.country ?? "Country unknown"} · ${data.matches.length} stored matches`}>
      <div className="space-y-6">
        <Link to="/referees" className="text-xs text-muted-foreground hover:underline">← All referees</Link>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Stat label="Yellow cards / game" value={fmt(s.yellow)} note={s.yellow ? `${s.yellow.n} games with card data` : "No card data"} />
          <Stat label="Red cards / game" value={fmt(s.red)} note={s.red ? `${s.red.n} games` : undefined} />
          <Stat label="Fouls / game" value={fmt(s.fouls, 1)} note={s.fouls ? `${s.fouls.n} games` : "No foul data"} />
          <Stat label="Home wins" value={s.homeWinShare != null ? `${Math.round(s.homeWinShare * 100)}%` : "—"} note={`${s.decided} finished games`} />
          <Stat label="Goals / game" value={s.goals != null ? s.goals.toFixed(2) : "—"} />
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border"><th className="p-2 text-left">Date</th><th className="p-2 text-left">Match</th><th className="p-2 text-right">Score</th><th className="p-2 text-right">Yellow</th><th className="p-2 text-right">Red</th><th className="p-2 text-right">Fouls</th></tr>
            </thead>
            <tbody>
              {data.matches.map((m, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="p-2 text-xs text-muted-foreground">{new Date(m.date).toLocaleDateString()}</td>
                  <td className="p-2">{m.id ? <Link to="/matches/$matchId" params={{ matchId: m.id }} className="hover:underline">{m.home} – {m.away}</Link> : `${m.home} – ${m.away}`}<span className="ml-2 text-[11px] text-muted-foreground">{m.league}</span></td>
                  <td className="p-2 text-right tabular-nums">{m.hg != null ? `${m.hg}–${m.ag}` : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{m.yellow ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{m.red ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{m.fouls ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
