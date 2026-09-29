import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cell } from "@/components/CoachDossier";
import { useAuth } from "@/hooks/useAuth";
import { deleteTeamTracking, getTeamTracking, saveTeamTracking } from "@/lib/tracking.functions";

const trackingQuery = (teamId: string) =>
  queryOptions({ queryKey: ["team-tracking", teamId], queryFn: () => getTeamTracking({ data: { teamId } }) });

export const Route = createFileRoute("/teams/$teamId_/distance")({
  head: () => ({
    meta: [
      { title: "Distance per 90 | Football Intelligence" },
      { name: "description", content: "Club running distance per 90 minutes from your own uploaded tracking data." },
      { property: "og:title", content: "Distance per 90 | Football Intelligence" },
      { property: "og:description", content: "Team running distance per 90 from your own tracking data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(trackingQuery(params.teamId)),
  component: DistancePage,
});

function DistancePage() {
  const { teamId } = Route.useParams();
  const { data } = useSuspenseQuery(trackingQuery(teamId));
  const { user } = useAuth();
  const qc = useQueryClient();
  const save = useServerFn(saveTeamTracking);
  const remove = useServerFn(deleteTeamTracking);
  const [form, setForm] = useState({ matchDate: "", opponent: "", distanceKm: "", minutes: "90" });
  const [busy, setBusy] = useState(false);

  const km = data.rows.reduce((s, r) => s + r.distanceKm, 0);
  const min = data.rows.reduce((s, r) => s + r.minutes, 0);
  const per90 = min ? ((km / min) * 90).toFixed(1) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ data: { teamId, rows: [{ matchDate: form.matchDate, opponent: form.opponent || null, distanceKm: Number(form.distanceKm), minutes: Number(form.minutes) || 90 }] } });
      toast.success("Match saved");
      setForm({ matchDate: "", opponent: "", distanceKm: "", minutes: "90" });
      await qc.invalidateQueries({ queryKey: ["team-tracking", teamId] });
      await qc.invalidateQueries({ queryKey: ["team-stats", teamId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={`${data.team?.name ?? "Team"} · distance per 90`} subtitle="From your own tracking data only — never estimated.">
      <div className="space-y-6">
        <Link to="/teams/$teamId" params={{ teamId }} className="text-xs text-muted-foreground underline-offset-4 hover:underline">← Team stats</Link>
        <div className="grid grid-cols-3 gap-2 text-xs sm:max-w-md">
          <Cell label="Distance / 90" value={per90 ? `${per90} km` : "n/a"} />
          <Cell label="Matches" value={String(data.rows.length)} />
          <Cell label="Total km" value={km.toFixed(1)} />
        </div>

        {user ? (
          <form onSubmit={submit} className="grid gap-2 rounded-lg border border-border bg-card p-4 sm:grid-cols-5">
            <Input type="date" required value={form.matchDate} onChange={(e) => setForm({ ...form, matchDate: e.target.value })} aria-label="Match date" />
            <Input placeholder="Opponent" value={form.opponent} onChange={(e) => setForm({ ...form, opponent: e.target.value })} />
            <Input type="number" step="0.1" min="1" max="199" required placeholder="Team km" value={form.distanceKm} onChange={(e) => setForm({ ...form, distanceKm: e.target.value })} />
            <Input type="number" min="1" max="150" placeholder="Minutes" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add match"}</Button>
            <p className="text-xs text-muted-foreground sm:col-span-5">Admins only. Enter the whole team's distance for the match (usually 100–120 km).</p>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">Sign in as an admin to add tracking data.</p>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 font-mono text-[10px] uppercase text-muted-foreground">
              <tr>{["Date", "Opponent", "Km", "Min", "Km / 90", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {data.rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground">No tracking data yet.</td></tr> : null}
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-3 py-2">{r.matchDate}</td>
                  <td className="px-3 py-2 font-sans">{r.opponent ?? "—"}</td>
                  <td className="px-3 py-2">{r.distanceKm}</td>
                  <td className="px-3 py-2">{r.minutes}</td>
                  <td className="px-3 py-2">{r.per90}</td>
                  <td className="px-3 py-2 text-right">
                    {user ? (
                      <button className="text-destructive hover:underline" onClick={async () => { try { await remove({ data: { id: r.id } }); await qc.invalidateQueries({ queryKey: ["team-tracking", teamId] }); } catch { toast.error("Could not delete"); } }}>Delete</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
