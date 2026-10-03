import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { getTrackRecord, type Bucket } from "@/lib/track-record.functions";

const q = queryOptions({ queryKey: ["track-record"], queryFn: () => getTrackRecord(), staleTime: 10 * 60_000 });

export const Route = createFileRoute("/track-record")({
  head: () => ({
    meta: [
      { title: "Pick track record · AI Football Intelligence" },
      { name: "description", content: "How every settled AI pick did: hit rate by market, league, confidence and month." },
      { property: "og:title", content: "Pick track record · AI Football Intelligence" },
      { property: "og:description", content: "Honest hit rates for every settled AI football pick." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: TrackRecordPage,
});

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Table({ title, rows }: { title: string; rows: Bucket[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr><th className="text-left font-normal">Group</th><th className="text-right font-normal">Picks</th><th className="text-right font-normal">Won</th><th className="text-right font-normal">Expected</th><th className="w-1/3 font-normal" /></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const hit = r.hits / r.picks, exp = r.expected / r.picks;
            return (
              <tr key={r.key} className="border-t border-border/50">
                <td className="py-1.5">{r.key}</td>
                <td className="text-right tabular-nums">{r.picks}</td>
                <td className={`text-right tabular-nums ${hit < exp - 0.05 ? "text-destructive" : hit >= exp ? "text-primary" : ""}`}>{pct(hit)}</td>
                <td className="text-right tabular-nums text-muted-foreground">{pct(exp)}</td>
                <td className="pl-3"><div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: pct(hit) }} /></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function TrackRecordPage() {
  const { data } = useSuspenseQuery(q);
  return (
    <AppShell title="Pick track record" subtitle={`${data.total} settled picks · ${data.total ? pct(data.hits / data.total) : "—"} won · model expected ${data.total ? pct(data.expected / data.total) : "—"}`}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">"Expected" is the average chance the model gave. Won below expected = the model was too confident there.</p>
        {data.warnings.length > 0 && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <b>Weak markets right now:</b>{" "}
            {data.warnings.map((w) => `${w.market} (${pct(w.recentHitRate)} of last ${w.recentPicks})`).join(", ")}.
            {" "}New picks in these markets now need at least a 70% chance.
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <Table title="By market" rows={data.byMarket} />
          <Table title="By confidence" rows={data.byConfidence} />
          <Table title="By month" rows={data.byMonth} />
          <Table title="By league (top 20)" rows={data.byLeague} />
        </div>
      </div>
    </AppShell>
  );
}
