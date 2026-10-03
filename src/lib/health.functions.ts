import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JobHealthRow = {
  jobType: string;
  lastStatus: string;
  lastRunAt: string;
  lastDurationMs: number | null;
  lastRecords: number;
  runs7d: number;
  failed7d: number;
  hoursSinceRun: number;
};

/** Admin-only: last run and 7-day failure count for each scheduled job, plus overdue picks. */
export const getJobHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { isAdmin: false, jobs: [] as JobHealthRow[], overduePicks: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data } = await supabaseAdmin
      .from("ingestion_jobs")
      .select("job_type, status, started_at, duration_ms, records_processed")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(3000);
    const map = new Map<string, JobHealthRow>();
    for (const r of data ?? []) {
      let row = map.get(r.job_type);
      if (!row) {
        row = {
          jobType: r.job_type,
          lastStatus: r.status,
          lastRunAt: r.started_at,
          lastDurationMs: r.duration_ms,
          lastRecords: r.records_processed,
          runs7d: 0,
          failed7d: 0,
          hoursSinceRun: (Date.now() - new Date(r.started_at).getTime()) / 3_600_000,
        };
        map.set(r.job_type, row);
      }
      row.runs7d += 1;
      if (r.status === "failed") row.failed7d += 1;
    }
    const { count } = await supabaseAdmin
      .from("ai_bet_log")
      .select("id", { count: "exact", head: true })
      .eq("result", "pending")
      .lt("kickoff_at", new Date(Date.now() - 86_400_000).toISOString());
    return {
      isAdmin: true,
      jobs: [...map.values()].sort((a, b) => a.jobType.localeCompare(b.jobType)),
      overduePicks: count ?? 0,
    };
  });
