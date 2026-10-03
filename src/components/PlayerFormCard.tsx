import { useQuery } from "@tanstack/react-query";
import { getPlayerForm } from "@/lib/player-stats.functions";

export function PlayerFormCard({ playerId }: { playerId: string }) {
  const q = useQuery({ queryKey: ["player-form", playerId], queryFn: () => getPlayerForm({ data: { playerId } }) });
  if (q.isLoading) return null;
  const f = q.data;
  return (
    <section>
      <h2 className="text-sm font-semibold">Form score</h2>
      {!f ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Not enough recent games stored yet (needs at least 3 games played).
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-6 rounded-md border border-border p-4">
          <div>
            <div className="text-4xl font-bold tabular-nums">{f.score}</div>
            <div className="text-xs text-muted-foreground">
              {f.score >= 70 ? "In form" : f.score >= 45 ? "Steady" : "Out of form"} · last {f.games} games
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <dt className="text-muted-foreground">Avg rating</dt>
            <dd className="font-medium">{f.avgRating ?? "—"}</dd>
            <dt className="text-muted-foreground">Goals + assists</dt>
            <dd className="font-medium">{f.goalsAssists}</dd>
            <dt className="text-muted-foreground">Avg minutes</dt>
            <dd className="font-medium">{f.avgMinutes}</dd>
            <dt className="text-muted-foreground">Our xG</dt>
            <dd className="font-medium">{f.xg ?? "—"}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
