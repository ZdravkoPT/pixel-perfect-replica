import { useQuery } from "@tanstack/react-query";
import { getMatchNewsOpinion } from "@/lib/analysts.functions";

/** What this week's news says about the match — evidence only, never changes the chance. */
export function NewsOpinionCard({ matchId, homeName, awayName }: { matchId: string; homeName: string; awayName: string }) {
  const { data } = useQuery({ queryKey: ["news-opinion", matchId], queryFn: () => getMatchNewsOpinion({ data: { matchId } }), staleTime: 300_000 });
  if (!data) return null;
  const side = (name: string, t: typeof data.home) => (t.negatives.length || t.positives.length || t.rumours) ? (
    <div className="text-xs">
      <div className="font-medium">{name}</div>
      {t.negatives.map((x) => <div key={x} className="text-destructive">− {x}</div>)}
      {t.positives.map((x) => <div key={x} className="text-primary">+ {x}</div>)}
      {t.rumours > 0 && <div className="text-muted-foreground">{t.rumours} rumour{t.rumours > 1 ? "s" : ""} (not counted)</div>}
    </div>) : null;
  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">News read</h3>
      <p className="mt-1 text-xs text-muted-foreground">{data.opinion}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{side(homeName, data.home)}{side(awayName, data.away)}</div>
      <p className="mt-2 text-[11px] text-muted-foreground">Based on {data.tagged} of {data.total} headlines read by the AI. News can lower a pick's confidence but never changes its chance.</p>
    </div>
  );
}
