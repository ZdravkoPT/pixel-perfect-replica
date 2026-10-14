import { useQuery } from "@tanstack/react-query";
import { getAnalystReports } from "@/lib/analysts.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AnalystsPanel({ matchId, homeName, awayName }: { matchId: string; homeName: string; awayName: string }) {
  const q = useQuery({ queryKey: ["analysts", matchId], queryFn: () => getAnalystReports({ data: { matchId } }), staleTime: 10 * 60e3 });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">The analysts are reading the match data… this can take up to a minute.</p>;
  const b = q.data;
  if (!b || b.reports.length === 0) return <p className="text-sm text-muted-foreground">{b?.message ?? "No analyst reports yet."}</p>;
  const lean = (l: string) => (l === "home" ? homeName : l === "away" ? awayName : l === "draw" ? "Draw" : "No view");
  const chief = b.reports.find((r) => r.role === "Chief");
  const rest = b.reports.filter((r) => r.role !== "Chief");
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Written by AI from stored data only. Reports never change the AI probabilities. {b.generatedAt && `Updated ${new Date(b.generatedAt).toLocaleString()}.`}
        {b.status === "unavailable" && b.message && ` ${b.message}`}
      </p>
      {chief && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base">Chief analyst <Badge variant="secondary">{lean(chief.leaning)}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm"><p>{chief.summary}</p><ul className="list-disc space-y-1 pl-5">{chief.findings.map((f, i) => <li key={i}>{f}</li>)}</ul></CardContent>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {rest.map((r) => (
          <Card key={r.role}>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm">{r.role} analyst <Badge variant="outline">{lean(r.leaning)}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{r.summary}</p>
              <ul className="list-disc space-y-1 pl-5">{r.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
              {r.evidence.length > 0 && <p className="text-xs text-muted-foreground">Evidence: {r.evidence.join(" · ")}</p>}
              {r.missing.length > 0 && <p className="text-xs text-muted-foreground">Not in our data: {r.missing.join(" · ")}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
