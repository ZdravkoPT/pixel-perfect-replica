import { useQuery } from "@tanstack/react-query";
import { getPrematchChecklist } from "@/lib/checklist.functions";

const tone: Record<string, string> = { good: "bg-primary", warn: "bg-destructive", neutral: "bg-muted-foreground", unknown: "bg-muted" };

/** Before-kickoff checklist: line-ups, absences, referee, weather, rest, motivation, AI verdict. */
export function PrematchChecklist({ matchId }: { matchId: string }) {
  const { data } = useQuery({ queryKey: ["checklist", matchId], queryFn: () => getPrematchChecklist({ data: { matchId } }), staleTime: 5 * 60_000 });
  if (!data?.length) return null;
  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold">Before kickoff</h2>
      <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
        {data.map((i) => (
          <li key={i.label} className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone[i.tone]}`} />
            <span><span className="text-muted-foreground">{i.label}:</span> {i.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
