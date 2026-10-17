import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Cell } from "@/components/CoachDossier";
import { getTeamStats } from "@/lib/intel.functions";
import { TeamFormChart } from "@/components/TeamFormChart";
import { useQuery } from "@tanstack/react-query";
import { getTeamAbsences } from "@/lib/leagues.functions";
import { getTeamStyle } from "@/lib/team-style.functions";
import { TeamNewsOpinion } from "@/components/NewsOpinionCard";

const teamStatsQuery = (teamId: string) =>
  queryOptions({ queryKey: ["team-stats", teamId], queryFn: () => getTeamStats({ data: { teamId } }) });

export const Route = createFileRoute("/teams/$teamId")({
  head: () => ({
    meta: [
      { title: "Team stats | Football Intelligence" },
      { name: "description", content: "Club-level stats: results, goals per game, clean sheets, BTTS and over 2.5 rates, home/away splits and recent form." },
      { property: "og:title", content: "Team stats | Football Intelligence" },
      { property: "og:description", content: "Team-level results, goal rates, splits and form." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(teamStatsQuery(params.teamId)),
  component: TeamStatsPage,
});

type Split = { played: number; w: number; d: number; l: number; gf: number; ga: number; cs: number; btts: number; o25: number };
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const per = (n: number, d: number) => (d ? (n / d).toFixed(2) : "—");
const fmt = (v: number | null, suffix = "") => (v == null ? "—" : `${v}${suffix}`);

function SplitBlock({ label, s }: { label: string; s: Split }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label} · {s.played} games</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-5">
        <Cell label="W-D-L" value={`${s.w}-${s.d}-${s.l}`} />
        <Cell label="PPG" value={per(s.w * 3 + s.d, s.played)} />
        <Cell label="GF / g" value={per(s.gf, s.played)} />
        <Cell label="GA / g" value={per(s.ga, s.played)} />
        <Cell label="Clean sh." value={pct(s.cs, s.played)} />
        <Cell label="BTTS" value={pct(s.btts, s.played)} />
        <Cell label="Over 2.5" value={pct(s.o25, s.played)} />
        <Cell label="Win %" value={pct(s.w, s.played)} />
      </div>
    </div>
  );
}

function TeamStatsPage() {
  const { teamId } = Route.useParams();
  const { data } = useSuspenseQuery(teamStatsQuery(teamId));
  if (!data.team) {
    return <AppShell title="Team not found"><p className="text-sm text-muted-foreground">This club is not in the database.</p></AppShell>;
  }
  return (
    <AppShell title={`${data.team.name} · team stats`} subtitle="From the last 60 finished matches in our archive.">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 text-xs">
          <Link to="/squads/$teamId" params={{ teamId }} className="text-muted-foreground underline-offset-4 hover:underline">← Squad</Link>
          <Link to="/compare" className="text-muted-foreground underline-offset-4 hover:underline">Compare players</Link>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Physical & match stats per 90</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Cell label="Distance / 90" value={data.distancePer90 == null ? "n/a" : `${data.distancePer90} km`} />
            <Cell label="Possession" value={fmt(data.box.possession, "%")} />
            <Cell label="Shots" value={fmt(data.box.shots)} />
            <Cell label="On target" value={fmt(data.box.shotsOnTarget)} />
            <Cell label="Corners" value={fmt(data.box.corners)} />
            <Cell label="Fouls" value={fmt(data.box.fouls)} />
            <Cell label="Yellow cards" value={fmt(data.box.yellow)} />
            <Cell label="Pass acc." value={fmt(data.box.passAccuracy, "%")} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Distance per 90 comes only from your own tracking data.{" "}
            <Link to="/teams/$teamId/distance" params={{ teamId }} className="text-primary underline-offset-4 hover:underline">
              Open distance per 90 →
            </Link>
            {data.box.samples === 0 ? " Box-score stats fill in as match statistics are imported." : ` Box score based on ${data.box.samples} matches.`}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SplitBlock label="All" s={data.all} />
          <SplitBlock label="Home" s={data.home} />
          <SplitBlock label="Away" s={data.away} />
        </div>

        <StyleProfile teamId={teamId} />

        <TeamNewsOpinion teamId={teamId} />

        <Absences teamId={teamId} />

        <section>
          <h2 className="text-sm font-semibold">Form by season</h2>
          <div className="mt-3"><TeamFormChart seasons={data.seasons} /></div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Last 10 results</h2>
          <div className="mt-3 space-y-1">
            {data.form.length === 0 ? <p className="text-xs text-muted-foreground">No finished matches in the archive yet.</p> : null}
            {data.form.map((f) => (
              <Link key={f.id} to="/matches/$matchId" params={{ matchId: f.id }} className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 text-xs hover:border-primary">
                <span className="flex items-center gap-2">
                  <Badge variant={f.result === "W" ? "default" : f.result === "L" ? "destructive" : "secondary"} className="w-6 justify-center">{f.result}</Badge>
                  <span className="font-mono text-muted-foreground">{f.venue}</span>
                  {f.opponent}
                </span>
                <span className="font-mono tabular-nums">{f.gf}–{f.ga} · <span className="text-muted-foreground">{new Date(f.date).toLocaleDateString()}</span></span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StyleProfile({ teamId }: { teamId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["team-style", teamId], queryFn: () => getTeamStyle({ data: { teamId } }) });
  return (
    <section>
      <h2 className="text-sm font-semibold">Playing style</h2>
      {isLoading ? <p className="mt-2 text-xs text-muted-foreground">Loading…</p> : !data ? (
        <p className="mt-2 text-xs text-muted-foreground">Not enough match statistics yet (needs 3 games).</p>
      ) : (
        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          {data.tags.length ? <div className="mb-3 flex flex-wrap gap-1">{data.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div> : null}
          <div className="space-y-2">
            {data.metrics.map((m) => (
              <div key={m.key} className="text-xs">
                <div className="flex justify-between"><span>{m.label}</span><span className="font-mono tabular-nums">{m.value} · <span className="text-muted-foreground">higher than {m.pct}% of teams</span></span></div>
                <div className="mt-1 h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${m.pct}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Average of the last {data.samples} games with match statistics.</p>
        </div>
      )}
    </section>
  );
}

function Absences({ teamId }: { teamId: string }) {
  const { data } = useQuery({ queryKey: ["team-absences", teamId], queryFn: () => getTeamAbsences({ data: { teamId } }) });
  return (
    <section>
      <h2 className="text-sm font-semibold">Injuries &amp; suspensions</h2>
      {!data ? <p className="mt-2 text-xs text-muted-foreground">Loading…</p> : data.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No known absences.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card text-sm">
          {data.map((a) => (
            <li key={a.playerId + a.kind} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <Link to="/players/$playerId" params={{ playerId: a.playerId }} className="font-medium hover:underline">{a.name}</Link>
                <p className="truncate text-xs text-muted-foreground">{a.reason}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={a.kind === "suspension" ? "destructive" : "secondary"}>{a.kind === "suspension" ? "Suspended" : "Injured"}</Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {a.expectedReturn ? `back ~${new Date(a.expectedReturn).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "return unknown"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
