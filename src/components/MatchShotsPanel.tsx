import { useQuery } from "@tanstack/react-query";
import { getMatchFacts } from "@/lib/facts.functions";
import { Card } from "@/components/ui/card";

/** Shot map, momentum graph and per-player ratings from the live FotMob feed. Blank when not covered. */
export function MatchShotsPanel({ matchId, homeName, awayName }: { matchId: string; homeName: string; awayName: string }) {
  const { data } = useQuery({
    queryKey: ["match-facts", matchId],
    queryFn: () => getMatchFacts({ data: { matchId } }),
  });
  const f = data?.facts;
  const shots = f?.shots ?? [];
  const momentum = f?.momentum ?? [];
  const ratings = f?.playerRatings ?? [];
  if (!shots.length && !momentum.length && !ratings.length) return null;

  const xgSum = (s: "home" | "away") =>
    shots.filter((x) => x.side === s).reduce((a, x) => a + (x.xg ?? 0), 0).toFixed(2);
  const maxM = Math.max(1, ...momentum.map((m) => Math.abs(m.value)));
  const W = 210, H = 68;

  return (
    <div className="space-y-4">
      {shots.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex justify-between text-sm font-medium">
            <span>{homeName} · xG {xgSum("home")}</span>
            <span>Shot map</span>
            <span>xG {xgSum("away")} · {awayName}</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md bg-pitch">
            <g stroke="var(--pitch-lines)" fill="none" strokeWidth={0.4}>
              <rect x={0} y={0} width={W} height={H} />
              <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
              <circle cx={W / 2} cy={H / 2} r={9.15} />
              <rect x={0} y={13.85} width={16.5} height={40.3} />
              <rect x={W - 16.5} y={13.85} width={16.5} height={40.3} />
            </g>
            {shots.map((s, i) => {
              // Home attacks the right goal, away the left one.
              const x = s.side === "home" ? W / 2 + (s.x / 105) * (W / 2) : W / 2 - (s.x / 105) * (W / 2);
              const y = s.side === "home" ? s.y : H - s.y;
              const goal = s.outcome === "Goal";
              const r = 1 + Math.sqrt(s.xg ?? 0.02) * 4;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={r}
                  fill={goal ? (s.side === "home" ? "var(--stat-home)" : "var(--stat-away)") : "transparent"}
                  stroke={s.side === "home" ? "var(--stat-home)" : "var(--stat-away)"}
                  strokeWidth={0.6}
                  opacity={s.onTarget || goal ? 1 : 0.6}
                >
                  <title>{`${s.minute ?? "?"}' ${s.player ?? ""} — ${s.outcome}${s.xg != null ? `, xG ${s.xg.toFixed(2)}` : ""}`}</title>
                </circle>
              );
            })}
          </svg>
          <p className="mt-2 text-xs text-muted-foreground">Filled = goal. Bigger circle = higher xG. Hover a shot for details.</p>
        </Card>
      )}

      {momentum.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex justify-between text-sm font-medium">
            <span>{homeName} pressure</span>
            <span>Momentum</span>
            <span>{awayName} pressure</span>
          </div>
          <svg viewBox={`0 0 ${momentum.length} 40`} preserveAspectRatio="none" className="h-24 w-full">
            <line x1={0} y1={20} x2={momentum.length} y2={20} stroke="var(--border)" strokeWidth={0.2} />
            {momentum.map((m, i) => {
              const h = (Math.abs(m.value) / maxM) * 20;
              return (
                <rect
                  key={i}
                  x={i}
                  width={0.8}
                  y={m.value >= 0 ? 20 - h : 20}
                  height={h}
                  fill={m.value >= 0 ? "var(--stat-home)" : "var(--stat-away)"}
                />
              );
            })}
          </svg>
          <p className="mt-1 text-xs text-muted-foreground">Above the line: {homeName} on top. Below: {awayName}.</p>
        </Card>
      )}

      {ratings.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium">Player ratings</div>
          <div className="grid gap-4 md:grid-cols-2">
            {(["home", "away"] as const).map((side) => (
              <div key={side}>
                <div className="mb-1 text-xs uppercase text-muted-foreground">{side === "home" ? homeName : awayName}</div>
                <ul className="space-y-1 text-sm">
                  {ratings.filter((r) => r.side === side).map((r) => (
                    <li key={r.name} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {r.shirt ? <span className="mr-1 text-muted-foreground">{r.shirt}</span> : null}
                        {r.name}
                        {r.goals ? ` ⚽${r.goals > 1 ? r.goals : ""}` : ""}
                        {r.assists ? ` 🅰${r.assists > 1 ? r.assists : ""}` : ""}
                      </span>
                      <span
                        className={`rounded px-1.5 text-xs font-semibold ${r.rating >= 7.5 ? "bg-primary text-primary-foreground" : r.rating >= 6.5 ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}
                      >
                        {r.rating.toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
