import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/** Per-season form: rating (line) against minutes, goals and assists (bars). */
export function PlayerFormChart({ seasons }: { seasons: Row[] }) {
  const bySeason = new Map<string, { season: string; minutes: number; goals: number; assists: number; ratingSum: number; ratingN: number }>();
  for (const r of seasons) {
    const key = String(r["season"] ?? "");
    if (!key) continue;
    const e = bySeason.get(key) ?? { season: key, minutes: 0, goals: 0, assists: 0, ratingSum: 0, ratingN: 0 };
    e.minutes += num(r["minutes"]);
    e.goals += num(r["goals"]);
    e.assists += num(r["assists"]);
    if (num(r["rating"])) { e.ratingSum += num(r["rating"]); e.ratingN += 1; }
    bySeason.set(key, e);
  }
  const data = [...bySeason.values()]
    .sort((a, b) => a.season.localeCompare(b.season))
    .slice(-6)
    .map((e) => ({ season: e.season, minutes: e.minutes, goals: e.goals, assists: e.assists, rating: e.ratingN ? +(e.ratingSum / e.ratingN).toFixed(2) : null }));

  if (data.length < 2) return <p className="text-xs text-muted-foreground">Not enough seasons stored yet to draw a form chart.</p>;
  const hasMinutes = data.some((d) => d.minutes > 0);

  return (
    <div className="h-72 w-full rounded-lg border border-border bg-card p-3">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="season" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <YAxis yAxisId="c" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} allowDecimals={false} />
          <YAxis yAxisId="r" orientation="right" domain={[5, 9]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          {hasMinutes ? <YAxis yAxisId="m" hide /> : null}
          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {hasMinutes ? <Bar yAxisId="m" dataKey="minutes" name="Minutes" fill="var(--muted)" /> : null}
          <Bar yAxisId="c" dataKey="goals" name="Goals" fill="var(--primary)" />
          <Bar yAxisId="c" dataKey="assists" name="Assists" fill="var(--accent-foreground)" />
          <Line yAxisId="r" type="monotone" dataKey="rating" name="Rating" stroke="var(--chart-2, var(--primary))" strokeWidth={2} connectNulls dot />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
