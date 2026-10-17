import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { getProviderHealth } from "@/lib/football.functions";

const healthQuery = queryOptions({
  queryKey: ["provider-health"],
  queryFn: () => getProviderHealth(),
});

export const Route = createFileRoute("/providers")({
  head: () => ({
    meta: [
      { title: "Provider Health — Football Intelligence" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content: "Rate limits, priorities and ingestion job history for every football data provider.",
      },
      { property: "og:title", content: "Provider Health — Football Intelligence" },
      {
        property: "og:description",
        content: "Rate limits, priorities and ingestion job history for each data provider.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(healthQuery);
  },
  component: ProvidersPage,
});

function ProvidersPage() {
  const { data } = useSuspenseQuery(healthQuery);

  return (
    <AppShell title="Provider health" subtitle="Quota usage, priority and recent ingestion runs">
      <div className="grid gap-3 md:grid-cols-2">
        {data.sources.map((source) => (
          <div key={source.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{source.name}</h2>
              <Badge variant={source.status === "active" ? "secondary" : "destructive"}>
                {source.status}
              </Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
              <dt>Priority</dt>
              <dd className="text-right text-foreground">{source.priority}</dd>
              <dt>Per minute</dt>
              <dd className="text-right text-foreground">
                {source.requests_this_minute} / {source.rate_limit_per_min ?? "∞"}
              </dd>
              <dt>Per day</dt>
              <dd className="text-right text-foreground">
                {source.requests_today} / {source.rate_limit_per_day ?? "∞"}
              </dd>
              <dt>Last success</dt>
              <dd className="text-right text-foreground">
                {source.last_success_at ? new Date(source.last_success_at).toLocaleString() : "—"}
              </dd>
              <dt>License</dt>
              <dd className="text-right text-foreground">{source.license ?? "—"}</dd>
            </dl>
            {source.last_error ? (
              <p className="mt-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs">
                {source.last_error}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-2 text-sm font-semibold">Recent ingestion jobs</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="p-2">Started</th>
              <th className="p-2">Type</th>
              <th className="p-2">Status</th>
              <th className="p-2">Processed</th>
              <th className="p-2">Inserted</th>
              <th className="p-2">Updated</th>
              <th className="p-2">Errors</th>
              <th className="p-2">Trigger</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={8}>
                  No ingestion jobs recorded yet.
                </td>
              </tr>
            ) : (
              data.jobs.map((job) => (
                <tr key={job.id} className="border-t border-border">
                  <td className="p-2">{new Date(job.started_at).toLocaleString()}</td>
                  <td className="p-2">{job.job_type}</td>
                  <td className="p-2">{job.status}</td>
                  <td className="p-2 tabular-nums">{job.records_processed}</td>
                  <td className="p-2 tabular-nums">{job.records_inserted}</td>
                  <td className="p-2 tabular-nums">{job.records_updated}</td>
                  <td className="p-2 tabular-nums">{job.error_count}</td>
                  <td className="p-2">{job.triggered_by}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
