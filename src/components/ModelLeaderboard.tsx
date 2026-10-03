import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Result = { model: string; samples: number; logLoss: number; brier: number; accuracy: number };
const LABEL: Record<string, string> = {
  dixon_coles: "Dixon-Coles (time-weighted)",
  elo: "Elo ratings",
  poisson: "Poisson strengths",
  baseline: "League averages only",
  bivariate: "Bivariate Poisson (linked scores)",
  zero_inflated: "Zero-inflated Poisson (extra 0-0)",
  ensemble: "Blend: Dixon-Coles + Elo",
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
          <tr><th className="text-left font-normal">#</th><th className="text-left font-normal">Model</th><th className="text-right font-normal">Right result</th><th className="text-right font-normal">Error score (lower is better)</th></tr>
        </thead>
        <tbody className="font-mono">
          {results.map((r, i) => (
            <tr key={r.model} className={r.model === data.winner ? "text-primary" : ""}>
              <td>{i + 1}</td>
              <td className="font-sans">{LABEL[r.model] ?? r.model}</td>
              <td className="text-right">{Math.round(r.accuracy * 100)}%</td>
              <td className="text-right">{r.logLoss.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
