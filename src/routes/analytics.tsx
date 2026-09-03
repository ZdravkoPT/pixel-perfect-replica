import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { getModelOverview } from "@/lib/analytics.functions";

const overviewQuery = queryOptions({
  queryKey: ["model-overview"],
  queryFn: () => getModelOverview(),
});

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Model Analytics — Football Intelligence" },
      {
        name: "description",
        content:
          "Dixon-Coles and Elo model versions, walk-forward backtest accuracy, log loss, Brier score and team strength ratings.",
      },
      { property: "og:title", content: "Model Analytics — Football Intelligence" },
      {
        property: "og:description",
        content: "Model versions, walk-forward backtests and team strength ratings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(overviewQuery);
  },
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data } = useSuspenseQuery(overviewQuery);
  const latestBacktest = data.backtests[0] ?? null;
  const calibration = (latestBacktest?.calibration ?? []) as Array<{
    bucket: string;
    count: number;
    predicted: number;
    observed: number;
  }>;

  return (
    <AppShell
      title="Model analytics"
      subtitle="Elo + Dixon-Coles versions, walk-forward backtests and current team strength"
    >
      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Active model" value={data.models.find((m) => m.is_active)?.name ?? "none"} />
        <Stat
          label="Backtest accuracy"
          value={latestBacktest?.accuracy != null ? `${(Number(latestBacktest.accuracy) * 100).toFixed(1)}%` : "–"}
        />
        <Stat
          label="Log loss"
          value={latestBacktest?.log_loss != null ? Number(latestBacktest.log_loss).toFixed(3) : "–"}
        />
        <Stat
          label="Brier score"
          value={latestBacktest?.brier != null ? Number(latestBacktest.brier).toFixed(3) : "–"}
        />
      </section>

      <h2 className="mt-8 mb-2 text-sm font-semibold">Model versions</h2>
      <div className="space-y-2">
        {data.models.length === 0 ? (
          <p className="text-xs text-muted-foreground">No model trained yet.</p>
        ) : (
          data.models.map((model) => (
            <div key={model.id} className="rounded border border-border bg-card p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {model.name} v{model.version}{" "}
                  {model.is_active ? <Badge className="ml-2">active</Badge> : null}
                </span>
                <span className="text-muted-foreground">
                  {new Date(model.trained_at).toLocaleString()} · {model.training_samples} matches
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                {model.kind} · params {JSON.stringify(model.params)}
              </p>
            </div>
          ))
        )}
      </div>

      <h2 className="mt-8 mb-2 text-sm font-semibold">Calibration (latest backtest)</h2>
      {calibration.length === 0 ? (
        <p className="text-xs text-muted-foreground">Run a backtest to see calibration.</p>
      ) : (
        <div className="space-y-2 rounded border border-border bg-card p-4">
          {calibration.map((bin) => (
            <div key={bin.bucket} className="text-xs">
              <div className="flex justify-between">
                <span>{bin.bucket}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  predicted {(bin.predicted * 100).toFixed(0)}% · observed{" "}
                  {(bin.observed * 100).toFixed(0)}% · n={bin.count}
                </span>
              </div>
              <div className="mt-1 flex gap-1">
                <div className="h-1.5 flex-1 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-muted-foreground"
                    style={{ width: `${bin.predicted * 100}%` }}
                  />
                </div>
                <div className="h-1.5 flex-1 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${bin.observed * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-8 mb-2 text-sm font-semibold">Top Elo ratings</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {data.ratings.length === 0 ? (
          <p className="text-xs text-muted-foreground">No ratings computed yet.</p>
        ) : (
          data.ratings.map((rating, index) => {
            const team = rating.team as { name?: string; crest_url?: string | null } | null;
            return (
              <div
                key={`${team?.name ?? index}-${rating.as_of}`}
                className="flex items-center justify-between rounded border border-border bg-card p-2 text-xs"
              >
                <span className="flex items-center gap-2">
                  {team?.crest_url ? (
                    <img src={team.crest_url} alt="" loading="lazy" className="h-4 w-4" />
                  ) : null}
                  {team?.name ?? "Unknown"}
                </span>
                <span className="font-mono tabular-nums">{Number(rating.rating).toFixed(0)}</span>
              </div>
            );
          })
        )}
      </div>

      <h2 className="mt-8 mb-2 text-sm font-semibold">Training runs</h2>
      <div className="space-y-2">
        {data.runs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No runs yet.</p>
        ) : (
          data.runs.map((run) => (
            <div key={run.id} className="rounded border border-border bg-card p-3 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>
                  <Badge variant="outline" className="mr-2">
                    {run.status}
                  </Badge>
                  {run.samples} samples · {run.matches_scored} fixtures scored
                </span>
                <span>{new Date(run.started_at).toLocaleString()}</span>
              </div>
              {run.error ? <p className="mt-1 text-destructive">{run.error}</p> : null}
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold">{value}</p>
    </div>
  );
}
