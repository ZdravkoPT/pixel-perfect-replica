import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Season = { season: string; played: number; w: number; d: number; l: number; o25: number };

/** Wins, draws, losses and over-2.5 games per season. */
export function TeamFormChart({ seasons }: { seasons: Season[] }) {
  if (seasons.length === 0) return <p className="text-xs text-muted-foreground">No finished seasons in the archive yet.</p>;
  return (
    <div className="h-72 w-full rounded-lg border border-border bg-card p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={seasons} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="season" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="w" stackId="r" name="Wins" fill="var(--primary)" />
          <Bar dataKey="d" stackId="r" name="Draws" fill="var(--muted-foreground)" />
          <Bar dataKey="l" stackId="r" name="Losses" fill="var(--destructive)" />
          <Bar dataKey="o25" name="Over 2.5" fill="var(--chart-2, var(--accent-foreground))" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
