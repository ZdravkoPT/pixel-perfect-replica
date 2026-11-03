import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const db = async () => (await import("@/lib/db/admin.server")).supabaseAdmin;

export const getMatchReferee = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: row } = await (await db()).from("match_officials").select("referee:referees(id, name)").eq("match_id", data.matchId).eq("role", "referee").maybeSingle();
    return ((row as { referee?: { id: string; name: string } | null } | null)?.referee) ?? null;
  });

export const getLatestLambdas = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: row } = await (await db()).from("predictions").select("lambda_home, lambda_away").eq("match_id", data.matchId)
      .order("prediction_timestamp", { ascending: false }).limit(1).maybeSingle();
    return (row as { lambda_home: number | null; lambda_away: number | null } | null) ?? null;
  });

export const getLatestCompetition = createServerFn({ method: "GET" }).handler(async () => {
  const { data: row } = await (await db()).from("model_competitions").select("run_at, winner, results").order("run_at", { ascending: false }).limit(1).maybeSingle();
  return (row as { run_at: string; winner: string; results: Array<Record<string, number | string | null>> } | null) ?? null;
});
