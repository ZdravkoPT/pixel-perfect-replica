import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { getPickReview } from "@/lib/pick-review.functions";

const resultBadge = (result: string | null) => {
  if (result === "hit") return <Badge>Pick won</Badge>;
  if (result === "miss") return <Badge variant="destructive">Pick lost</Badge>;
  if (result === "void") return <Badge variant="secondary">Void</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
};

/** Pre-match picture behind every pick the AI logged for this fixture. */
export function PickReviewPanel({ matchId }: { matchId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["pick-review", matchId],
    queryFn: () => getPickReview({ data: { matchId } }),
    staleTime: 300_000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading AI pick review…</p>;
  if (!data || data.picks.length === 0) {
    return data?.note
      ? <p className="text-sm text-muted-foreground">{data.note}</p>
      : <p className="text-sm text-muted-foreground">No AI pick was logged for this fixture.</p>;
  }
  const s = data.snapshot;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">Pre-match picture</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Everything below was known strictly before kickoff — league table, Elo ratings and
          recent form. Missing values say so rather than guess.
        </p>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded border border-border px-3 py-2">
            <p className="font-medium">League table</p>
            <p className="mt-1 text-muted-foreground">
              {s.homeTable ? `Home: ${s.homeTable.pos}. (${s.homeTable.pts} pts / ${s.homeTable.played} games)` : "Home: no table yet"}
              <br />
              {s.awayTable ? `Away: ${s.awayTable.pos}. (${s.awayTable.pts} pts / ${s.awayTable.played} games)` : "Away: no table yet"}
            </p>
          </div>
          <div className="rounded border border-border px-3 py-2">
            <p className="font-medium">Elo at kickoff</p>
            <p className="mt-1 text-muted-foreground">
              {s.homeElo !== null ? `Home: ${Math.round(s.homeElo)}` : "Home: not recorded"}
              <br />
              {s.awayElo !== null ? `Away: ${Math.round(s.awayElo)}` : "Away: not recorded"}
            </p>
          </div>
          <div className="rounded border border-border px-3 py-2">
            <p className="font-medium">Last five before kickoff</p>
            <p className="mt-1 font-mono text-muted-foreground">
              {s.homeForm ?? "Home: –"}
              <br />
              {s.awayForm ?? "Away: –"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {data.picks.map((p, i) => (
          <div key={`${p.betDate}-${p.pickCode}-${i}`} className="rounded border border-border bg-card p-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.selection}</p>
                <p className="text-muted-foreground">{p.market} · logged {p.betDate} · chance {Math.round(p.probability * 100)}%</p>
              </div>
              {resultBadge(p.result)}
            </div>
            {p.flags.length > 0 && (
              <ul className="mt-2 space-y-1">
                {p.flags.map((flag, j) => (
                  <li key={j} className="border-l-2 border-chart-4 bg-muted/50 px-3 py-2 leading-relaxed text-muted-foreground">
                    Contradiction check: {flag}
                  </li>
                ))}
              </ul>
            )}
            {p.flags.length === 0 && p.backsHome !== null && (
              <p className="mt-2 text-muted-foreground">No contradiction with the pre-match table or Elo.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
