import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { getJobHealth } from "@/lib/health.functions";

export function JobHealthPanel() {
  const fetchHealth = useServerFn(getJobHealth);
  const q = useQuery({ queryKey: ["job-health"], queryFn: () => fetchHealth(), refetchInterval: 60_000 });
  if (!q.data?.isAdmin) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-semibold">System health</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        Picks still ungraded a day after kickoff:{" "}
        <span className={q.data.overduePicks > 0 ? "font-semibold text-destructive" : "font-semibold"}>
          {q.data.overduePicks}
        </span>
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="p-2">Job</th>
              <th className="p-2">Last run</th>
              <th className="p-2">Status</th>
              <th className="p-2 text-right">Rows</th>
              <th className="p-2 text-right">Runs / failed (7d)</th>
            </tr>
          </thead>
          <tbody>
            {q.data.jobs.map((j) => (
              <tr key={j.jobType} className="border-t border-border">
                <td className="p-2 font-medium">{j.jobType}</td>
                <td className="p-2">
                  {j.hoursSinceRun < 1 ? `${Math.round(j.hoursSinceRun * 60)} min ago` : `${j.hoursSinceRun.toFixed(1)} h ago`}
                </td>
                <td className="p-2">
                  <Badge variant={j.lastStatus === "failed" ? "destructive" : j.lastStatus === "partial" ? "secondary" : "outline"}>
                    {j.lastStatus}
                  </Badge>
                </td>
                <td className="p-2 text-right">{j.lastRecords}</td>
                <td className="p-2 text-right">
                  {j.runs7d} / {j.failed7d}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
