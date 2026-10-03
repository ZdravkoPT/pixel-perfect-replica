import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { getPlayerStats } from "@/lib/player-stats.functions";
import { PlayerFormChart } from "@/components/PlayerFormChart";

const statsQuery = (playerId: string) =>
  queryOptions({ queryKey: ["player-stats", playerId], queryFn: () => getPlayerStats({ data: { playerId } }) });

export const Route = createFileRoute("/players/$playerId_/stats")({
  head: () => ({
    meta: [
      { title: "Player stats: career, transfers & minutes | Football Intelligence" },
      { name: "description", content: "Season-by-season career stats, club moves, appearances and minutes played for a player." },
      { property: "og:title", content: "Player stats | Football Intelligence" },
      { property: "og:description", content: "Career stats, transfers, appearances and minutes." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(statsQuery(params.playerId)),
  errorComponent: ({ error }) => <AppShell title="Player stats"><p className="text-sm text-destructive">{(error as Error).message}</p></AppShell>,
  notFoundComponent: () => <AppShell title="Player not found"><p className="text-sm">Unknown player.</p></AppShell>,
  component: PlayerStatsPage,
});

type Row = Record<string, unknown>;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const n = (v: unknown) => (typeof v === "number" ? v : 0);
const s = (v: unknown) => (v == null || v === "" ? "—" : String(v));

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

function PlayerStatsPage() {
  const { playerId } = Route.useParams();
  const { data } = useSuspenseQuery(statsQuery(playerId));
  if (!data.player) return <AppShell title="Player not found"><p className="text-sm text-muted-foreground">This player is not in the database.</p></AppShell>;

  const career = (data.career ?? {}) as Row;
  const cur = (career["current_season"] ?? null) as Row | null;
  const seasons = arr(career["seasons"]);
  const clubs = arr(career["clubs"]).sort((a, b) => String(b["from"] ?? "").localeCompare(String(a["from"] ?? "")));
  const national = arr(career["national"]);
  const recent = arr((data.condition as Row | null)?.["recent_matches"]);
  const totals = seasons.reduce<{ apps: number; goals: number; assists: number }>(
    (t, r) => ({ apps: t.apps + n(r["appearances"]), goals: t.goals + n(r["goals"]), assists: t.assists + n(r["assists"]) }),
    { apps: 0, goals: 0, assists: 0 },
  );
  const current = data.memberships.find((m) => m.is_current);
  const team = current?.team as { id: string; name: string } | null | undefined;

  return (
    <AppShell title={`${data.player.name} · stats`} subtitle={`${team?.name ?? "No current club"} · ${data.player.position ?? "—"}`}>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-4 text-xs">
          <Link to="/players/$playerId" params={{ playerId }} className="text-muted-foreground underline-offset-4 hover:underline">← Profile</Link>
          {team ? <Link to="/squads/$teamId" params={{ teamId: team.id }} className="text-muted-foreground underline-offset-4 hover:underline">{team.name} squad</Link> : null}
          <Link to="/compare" search={{ a: playerId }} className="text-primary underline-offset-4 hover:underline">Compare →</Link>
        </div>

        {!data.career ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Career history for this player hasn't been imported yet — it fills in on the next automatic refresh.
          </div>
        ) : null}

        <section>
          <h2 className="text-sm font-semibold">This season</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Appearances" value={s(cur?.["matches"])} />
            <Stat label="Starts" value={s(cur?.["started"])} />
            <Stat label="Minutes" value={s(cur?.["minutes"])} />
            <Stat label="Mins / app" value={n(cur?.["matches"]) ? String(Math.round(n(cur?.["minutes"]) / n(cur?.["matches"]))) : "—"} />
            <Stat label="Goals" value={s(cur?.["goals"])} />
            <Stat label="Assists" value={s(cur?.["assists"])} />
            <Stat label="Rating" value={cur?.["rating"] ? Number(cur["rating"]).toFixed(2) : "—"} />
            <Stat label="Cards Y/R" value={`${s(cur?.["yellowCards"])} / ${s(cur?.["redCards"])}`} />
          </div>
          {data.condition ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Last 30 days: {data.condition.matches_30d} matches, {data.condition.minutes_30d} minutes.
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="text-sm font-semibold">Career totals</h2>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-md">
            <Stat label="Apps" value={String(totals.apps)} />
            <Stat label="Goals" value={String(totals.goals)} />
            <Stat label="Assists" value={String(totals.assists)} />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Form over recent seasons</h2>
          <div className="mt-2"><PlayerFormChart seasons={seasons} /></div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Season by season</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr><th className="px-3 py-2">Season</th><th className="px-3 py-2">Club</th><th className="px-3 py-2 text-right">Apps</th><th className="px-3 py-2 text-right">G</th><th className="px-3 py-2 text-right">A</th><th className="px-3 py-2 text-right">Rating</th></tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {seasons.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-3 text-muted-foreground">No season history stored yet.</td></tr>
                ) : seasons.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2">{s(r["season"])}</td>
                    <td className="px-3 py-2 font-sans">{s(r["team"])}</td>
                    <td className="px-3 py-2 text-right">{n(r["appearances"])}</td>
                    <td className="px-3 py-2 text-right">{n(r["goals"])}</td>
                    <td className="px-3 py-2 text-right">{n(r["assists"])}</td>
                    <td className="px-3 py-2 text-right">{n(r["rating"]) ? Number(r["rating"]).toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Transfers & club history</h2>
          <ol className="mt-2 space-y-2">
            {clubs.length === 0 ? <li className="text-xs text-muted-foreground">No club moves stored yet.</li> : clubs.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-card px-3 py-2 text-xs">
                <span className="font-medium">{s(c["team"])} {c["active"] ? <Badge className="ml-1 text-[10px]">Current</Badge> : null}</span>
                <span className="font-mono text-muted-foreground">{s(c["from"])} → {c["to"] ? String(c["to"]) : c["active"] ? "present" : "—"}</span>
                <span className="font-mono tabular-nums">{n(c["appearances"])} apps · {n(c["goals"])}G · {n(c["assists"])}A</span>
              </li>
            ))}
          </ol>
          {national.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              National team: {national.map((x) => `${s(x["team"])} (${n(x["caps"])} caps, ${n(x["goals"])}G)`).join(" · ")}
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="text-sm font-semibold">Recent appearances</h2>
          <div className="mt-2 space-y-1">
            {recent.length === 0 ? <p className="text-xs text-muted-foreground">No recent match log stored yet.</p> : recent.slice(0, 15).map((r, i) => (
              <div key={i} className="flex justify-between rounded border border-border px-3 py-1.5 font-mono text-xs tabular-nums">
                <span>{s(r["date"]).slice(0, 10)} · <span className="font-sans">{s(r["opponent"] ?? r["team"])}</span></span>
                <span>{n(r["minutes"])}' {r["rating"] ? `· ${Number(r["rating"]).toFixed(1)}` : ""}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
