import { useQuery } from "@tanstack/react-query";
import { getHeadToHead } from "@/lib/intel.functions";

export function HeadToHeadPanel({ matchId }: { matchId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["head-to-head", matchId],
    queryFn: () => getHeadToHead({ data: { matchId } }),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading previous meetings…</p>;

  const summary = data?.summary ?? null;
  if (!summary) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No previous meetings between these clubs in the archive.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">
          Last {summary.played} meetings
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Fact label={`${data?.homeName} wins`} value={String(summary.homeWins)} />
          <Fact label="Draws" value={String(summary.draws)} />
          <Fact label={`${data?.awayName} wins`} value={String(summary.awayWins)} />
          <Fact label="Goals" value={`${summary.goalsHome} – ${summary.goalsAway}`} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Fact label="Over 2.5 goals" value={`${(summary.over25Rate * 100).toFixed(0)}%`} />
          <Fact label="Both teams scored" value={`${(summary.bttsRate * 100).toFixed(0)}%`} />
        </div>
      </div>

      <div className="space-y-2">
        {(data?.meetings ?? []).map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between rounded border border-border bg-card p-3 text-xs"
          >
            <span className="text-muted-foreground">
              {new Date(row.kickoffAt).toLocaleDateString()} · {row.league}
            </span>
            <span>
              {row.homeTeam}{" "}
              <span className="font-mono tabular-nums">
                {row.homeScore ?? "–"} : {row.awayScore ?? "–"}
              </span>{" "}
              {row.awayTeam}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}
