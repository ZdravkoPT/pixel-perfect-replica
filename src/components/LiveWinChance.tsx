import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const pmf = (k: number, l: number) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return Math.exp(-l) * Math.pow(l, k) / f; };

/** Live home/draw/away chance: pre-match goal rates scaled to the minutes left, added to the current score. */
export function LiveWinChance({ matchId, homeName, awayName, homeScore, awayScore, minute }: {
  matchId: string; homeName: string; awayName: string; homeScore: number; awayScore: number; minute: number | null;
}) {
  const { data: pred } = useQuery({
    queryKey: ["live-lambdas", matchId],
    queryFn: async () => {
      const { data } = await supabase.from("predictions").select("lambda_home, lambda_away").eq("match_id", matchId)
        .order("prediction_timestamp", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });
  if (!pred || minute == null) return null;
  const left = Math.max(0, 90 - minute) / 90;
  const lh = Number(pred.lambda_home) * left, la = Number(pred.lambda_away) * left;
  let h = 0, d = 0, a = 0;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const p = pmf(i, lh) * pmf(j, la), fh = homeScore + i, fa = awayScore + j;
    if (fh > fa) h += p; else if (fh === fa) d += p; else a += p;
  }
  const s = h + d + a || 1;
  const cells = [[homeName, h / s], ["Draw", d / s], [awayName, a / s]] as const;
  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Live win chance · {minute}′</h2>
      <p className="mb-2 text-xs text-muted-foreground">From the pre-match goal rates for the minutes left, added to the current score. Red cards aren't counted.</p>
      <div className="flex h-3 overflow-hidden rounded">
        <div className="bg-primary" style={{ width: `${(h / s) * 100}%` }} />
        <div className="bg-muted" style={{ width: `${(d / s) * 100}%` }} />
        <div className="bg-accent" style={{ width: `${(a / s) * 100}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 text-center text-xs">
        {cells.map(([n, p]) => <div key={n}><b className="text-base tabular-nums">{Math.round(p * 100)}%</b><div className="truncate text-muted-foreground">{n}</div></div>)}
      </div>
    </section>
  );
}
