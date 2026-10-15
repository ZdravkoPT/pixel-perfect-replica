import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Result = { model: string; samples: number; logLoss: number; brier: number; accuracy: number; rps?: number; accuracyRange?: [number, number]; logLossRange?: [number, number]; recent?: { samples: number; accuracy: number | null; logLoss: number | null }; alwaysHomeAccuracy?: number | null; calibration?: { predicted: number; actual: number; n: number }[] };
const LABEL: Record<string, string> = {
  dixon_coles: "Dixon-Coles (time-weighted)",
  elo: "Elo ratings",
  poisson: "Poisson strengths",
  baseline: "League averages only",
  bivariate: "Bivariate Poisson (linked scores)",
  zero_inflated: "Zero-inflated Poisson (extra 0-0)",
  xg_dixon_coles: "Dixon-Coles on goals + xG (Understat)",
  ensemble: "Blend: Dixon-Coles + Elo",
  pi_ratings: "Pi-ratings (home/away strength)",
  glicko: "Glicko (Elo with uncertainty)",
  stacked: "Blended learner (weights all models)",
  features: "Pattern learner",
  dc_fast: "Dixon-Coles (recent games count more)",
};

/** Latest weekly walk-forward model competition over imported league history. */
export function ModelLeaderboard() {
  const { data } = useQuery({
    queryKey: ["model-competition"],
    queryFn: async () => {
      const { data } = await supabase.from("model_competitions").select("run_at, winner, results")
        .order("run_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    staleTime: 30 * 60_000,
  });
  if (!data) return null;
  const results = (data.results ?? []) as Result[];
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold">Model competition</h2>
        <p className="text-xs text-muted-foreground">
          Each model re-predicted {results[0]?.samples.toLocaleString()} past league matches using only earlier results.
          The winner feeds every match pick. Last run {new Date(data.run_at).toLocaleDateString()}.
        </p>
      </div>
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr><th className="text-left font-normal">#</th><th className="text-left font-normal">Model</th><th className="text-right font-normal">Right result</th><th className="text-right font-normal">Error score (lower is better)</th><th className="text-right font-normal">Ranked score</th><th className="text-right font-normal">Last 8 weeks</th></tr>
        </thead>
        <tbody className="font-mono">
          {results.map((r, i) => (
            <tr key={r.model} className={r.model === data.winner ? "text-primary" : ""}>
              <td>{i + 1}</td>
              <td className="font-sans">{LABEL[r.model] ?? r.model}</td>
              <td className="text-right">{Math.round(r.accuracy * 100)}%{r.accuracyRange && <span className="text-muted-foreground"> ({Math.round(r.accuracyRange[0] * 100)}–{Math.round(r.accuracyRange[1] * 100)})</span>}</td>
              <td className="text-right">{r.logLoss.toFixed(3)}</td>
              <td className="text-right">{r.rps != null ? r.rps.toFixed(3) : "—"}</td>
              <td className="text-right">{!r.recent ? "—" : r.recent.samples < 100 ? <span className="text-muted-foreground" title="Too few recent games to judge">{r.recent.samples} games</span>
                : <>{Math.round((r.recent.accuracy ?? 0) * 100)}%{(() => { const d = (r.recent.accuracy ?? 0) - r.accuracy; return Math.abs(d) >= 0.02 ? <span className={d > 0 ? "text-primary" : "text-destructive"}> {d > 0 ? "▲" : "▼"}</span> : null; })()}</>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(() => {
        const r0 = results[0];
        if (!r0) return null;
        const home = r0.alwaysHomeAccuracy;
        const lg = results.find((r) => r.model === "baseline");
        const w = results.find((r) => r.model === data.winner);
        return (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p><span className="font-medium text-foreground">Simple yardsticks:</span>{" "}
              {home != null ? `always picking the home team was right ${Math.round(home * 100)}%` : "always-home yardstick appears after the next weekly run"}
              {lg ? `; league averages only: ${Math.round(lg.accuracy * 100)}%` : ""}
              {w && home != null ? `. The winner beats always-home by ${Math.round((w.accuracy - home) * 100)} points.` : "."}</p>
            <p>Numbers in brackets are the likely range (95%). When two models' ranges overlap, the difference may be luck.
              "Last 8 weeks" shows recent accuracy; ▲/▼ means it moved 2+ points from the long-run figure. Under 100 recent games is too few to judge.</p>
          </div>
        );
      })()}
      {(() => {
        const cal = results.find((r) => r.model === data.winner)?.calibration;
        if (!cal?.length) return null;
        const pts = cal.map((c) => ({ predicted: Math.round(c.predicted * 100), actual: Math.round(c.actual * 100), ideal: Math.round(c.predicted * 100), n: c.n }));
        return (
          <div className="space-y-1 pt-2">
            <h3 className="text-xs font-semibold">How honest are the winner's percentages?</h3>
            <p className="text-xs text-muted-foreground">When the winning model said "X% chance", how often it really happened. Closer to the dashed line is better.</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pts} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="predicted" type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11 }}
                    formatter={(v: number, k: string) => [`${v}%`, k === "actual" ? "Happened" : "Said"]} labelFormatter={(l) => `Said ${l}%`} />
                  <Line dataKey="ideal" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
                  <Line dataKey="actual" stroke="var(--primary)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}
      <p className="text-xs text-muted-foreground">Ranked score = how far off the home/draw/away forecast was, counting a near-miss (draw instead of win) as less wrong. Lower is better.</p>
    </section>
  );
}
