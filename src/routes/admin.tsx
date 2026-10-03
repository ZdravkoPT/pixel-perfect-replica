import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { JobHealthPanel } from "@/components/JobHealthPanel";
import { getDiagnostics, triggerIngestion } from "@/lib/football.functions";
import { startBacktest, syncHistory, trainModels } from "@/lib/analytics.functions";
import {
  refreshAttributes,
  refreshCareers,
  refreshCoachProfiles,
  refreshIntel,
  refreshKickoff,
  refreshPlayerConditions,
  runBetHistoryReview,
  syncOfficials,
  syncSquads,
} from "@/lib/intel.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Diagnostics — Football Intelligence" },
      { name: "description", content: "Trigger fixture ingestion and review provider errors and conflicts." },
      { property: "og:title", content: "Diagnostics — Football Intelligence" },
      {
        property: "og:description",
        content: "Trigger ingestion and review provider errors and conflicts.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const fetchDiagnostics = useServerFn(getDiagnostics);
  const runIngestion = useServerFn(triggerIngestion);
  const runHistory = useServerFn(syncHistory);
  const runTraining = useServerFn(trainModels);
  const runBacktestFn = useServerFn(startBacktest);
  const runSquads = useServerFn(syncSquads);
  const runOfficials = useServerFn(syncOfficials);
  const runIntelFn = useServerFn(refreshIntel);
  const runKickoffFn = useServerFn(refreshKickoff);
  const runAttributesFn = useServerFn(refreshAttributes);
  const runCareersFn = useServerFn(refreshCareers);
  const runBetHistoryFn = useServerFn(runBetHistoryReview);
  const runCoachProfilesFn = useServerFn(refreshCoachProfiles);
  const runConditionsFn = useServerFn(refreshPlayerConditions);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const diagnostics = useQuery({
    queryKey: ["diagnostics"],
    queryFn: () => fetchDiagnostics(),
    enabled: Boolean(user),
  });

  if (loading) {
    return (
      <AppShell title="Diagnostics">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell title="Diagnostics" subtitle="Admin access required">
        <p className="text-sm text-muted-foreground">Sign in with an admin account to continue.</p>
      </AppShell>
    );
  }

  const runTask = async (label: string, task: () => Promise<unknown>) => {
    setBusy(true);
    setStatus(`${label}…`);
    try {
      const result = (await task()) as Record<string, unknown>;
      setStatus(`${label}: ${JSON.stringify(result)}`);
      await queryClient.invalidateQueries();
    } catch (error) {
      setStatus(`${label} failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const summary = await runIngestion({ data: { days: 7 } });
      setStatus(
        `${summary.status}: ${summary.processed} processed, ${summary.inserted} inserted, ${summary.updated} updated, ${summary.errors} errors in ${summary.durationMs}ms`,
      );
      await queryClient.invalidateQueries();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Diagnostics" subtitle="Manual sync, ingestion errors and provider conflicts">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={sync} disabled={busy}>
            {busy ? "Syncing…" : "Sync fixtures (today + 7 days)"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Historical sync", () => runHistory({ data: {} }))}
          >
            Sync historical seasons
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Model training", () => runTraining())}
          >
            Train models &amp; predict
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Backtest", () => runBacktestFn())}
          >
            Run walk-forward backtest
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Squad sync", () => runSquads())}
          >
            Sync squads
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Officials sync", () => runOfficials())}
          >
            Sync referees
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Intelligence refresh", () => runIntelFn())}
          >
            Refresh player intelligence
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Kickoff refresh", () => runKickoffFn())}
          >
            Run T-60 kickoff refresh
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Player skill cards", () => runAttributesFn())}
          >
            Refresh player skill cards
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Player careers", () => runCareersFn())}
          >
            Refresh player careers
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Bet review", () => runBetHistoryFn())}
          >
            Review last 10 weeks of bets
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Manager dossiers", () => runCoachProfilesFn())}
          >
            Refresh manager dossiers
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runTask("Player condition", () => runConditionsFn())}
          >
            Refresh player condition
          </Button>

        </div>
        {status ? <p className="mt-3 break-all text-xs text-muted-foreground">{status}</p> : null}
      </div>

      {diagnostics.data && !diagnostics.data.isAdmin ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Your account does not have the admin role, so error and conflict logs are hidden.
        </p>
      ) : null}

      <JobHealthPanel />

      <h2 className="mt-8 mb-2 text-sm font-semibold">Recent ingestion errors</h2>
      <div className="space-y-2">
        {(diagnostics.data?.errors ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No errors logged.</p>
        ) : (
          (diagnostics.data?.errors ?? []).map((error) => (
            <div key={error.id} className="rounded border border-border bg-card p-3 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>
                  <Badge variant="outline" className="mr-2">
                    {error.source_id ?? "system"}
                  </Badge>
                  {error.stage}
                </span>
                <span>{new Date(error.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1">{error.message}</p>
            </div>
          ))
        )}
      </div>

      <h2 className="mt-8 mb-2 text-sm font-semibold">Provider conflicts</h2>
      <div className="space-y-2">
        {(diagnostics.data?.conflicts ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No conflicts detected.</p>
        ) : (
          (diagnostics.data?.conflicts ?? []).map((conflict) => (
            <div key={conflict.id} className="rounded border border-border bg-card p-3 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>
                  {conflict.entity_type} · {conflict.field}
                </span>
                <span>{new Date(conflict.detected_at).toLocaleString()}</span>
              </div>
              <p className="mt-1">
                {conflict.source_a}: {JSON.stringify(conflict.value_a)} vs {conflict.source_b}:{" "}
                {JSON.stringify(conflict.value_b)}
              </p>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
