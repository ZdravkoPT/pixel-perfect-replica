import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Cell } from "@/components/CoachDossier";
import { getCoach } from "@/lib/intel.functions";

const coachQuery = (coachId: string) =>
  queryOptions({ queryKey: ["coach", coachId], queryFn: () => getCoach({ data: { coachId } }) });

export const Route = createFileRoute("/coaches/$coachId_/stats")({
  head: () => ({
    meta: [
      { title: "Manager stats | Football Intelligence" },
      { name: "description", content: "Manager career win/draw/loss record, points per game, trophy count and per-club statistics." },
      { property: "og:title", content: "Manager stats | Football Intelligence" },
      { property: "og:description", content: "Career W-D-L, trophies and per-club manager stats." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(coachQuery(params.coachId)),
  component: ManagerStatsPage,
});

type Rec = { team?: string; from?: string | null; to?: string | null; matches?: number; wins?: number; draws?: number; losses?: number; pointsPerGame?: number | null };
type Ach = { team?: string; won?: string[]; runnerUp?: string[] };
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

function ManagerStatsPage() {
  const { coachId } = Route.useParams();
  const { data } = useSuspenseQuery(coachQuery(coachId));
  if (!data.coach) return <AppShell title="Coach not found"><p className="text-sm text-muted-foreground">Not in the database.</p></AppShell>;
  const dossier = data.dossier as { seasons?: unknown; achievements?: unknown } | null;
  const records = arr<Rec>(dossier?.seasons);
  const achievements = arr<Ach>(dossier?.achievements);
  const titlesBy = new Map<string, number>();
  for (const a of achievements) titlesBy.set(a.team ?? "", (titlesBy.get(a.team ?? "") ?? 0) + (a.won?.length ?? 0));
  const trophies = [...titlesBy.values()].reduce((a, b) => a + b, 0);
  const runnerUps = achievements.reduce((n, a) => n + (a.runnerUp?.length ?? 0), 0);
  const t = records.reduce(
    (s, r) => ({ m: s.m + (r.matches ?? 0), w: s.w + (r.wins ?? 0), d: s.d + (r.draws ?? 0), l: s.l + (r.losses ?? 0) }),
    { m: 0, w: 0, d: 0, l: 0 },
  );

  return (
    <AppShell title={`${data.coach.name} · manager stats`} subtitle="Career record, trophies and per-club statistics.">
      <div className="space-y-8">
        <div className="flex gap-3 text-xs">
          <Link to="/coaches/$coachId_/history" params={{ coachId }} className="text-muted-foreground underline-offset-4 hover:underline">← Career history</Link>
          <Link to="/coaches/$coachId" params={{ coachId }} className="text-muted-foreground underline-offset-4 hover:underline">Profile</Link>
        </div>
        {records.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            No career record imported for this manager yet. It fills in on the next manager dossier refresh.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
          <Cell label="Matches" value={String(t.m)} />
          <Cell label="Wins" value={String(t.w)} />
          <Cell label="Draws" value={String(t.d)} />
          <Cell label="Losses" value={String(t.l)} />
          <Cell label="Win %" value={pct(t.w, t.m)} />
          <Cell label="PPG" value={t.m ? ((t.w * 3 + t.d) / t.m).toFixed(2) : "—"} />
          <Cell label="Trophies" value={String(trophies)} />
          <Cell label="Runner-up" value={String(runnerUps)} />
        </div>
        <section>
          <h2 className="text-sm font-semibold">Per-club stats</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>{["Club", "Period", "M", "W", "D", "L", "Win %", "PPG", "Trophies"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {records.map((r, i) => (
                  <tr key={i} className="border-t border-border/60">
                    <td className="px-3 py-2 font-sans font-medium">{r.team ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.from ?? "?"} → {r.to ?? "now"}</td>
                    <td className="px-3 py-2">{r.matches ?? 0}</td>
                    <td className="px-3 py-2">{r.wins ?? 0}</td>
                    <td className="px-3 py-2">{r.draws ?? 0}</td>
                    <td className="px-3 py-2">{r.losses ?? 0}</td>
                    <td className="px-3 py-2">{pct(r.wins ?? 0, r.matches ?? 0)}</td>
                    <td className="px-3 py-2">{r.pointsPerGame != null ? Number(r.pointsPerGame).toFixed(2) : "—"}</td>
                    <td className="px-3 py-2">{titlesBy.get(r.team ?? "") ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
