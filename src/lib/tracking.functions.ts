import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase as browserSafe } from "@/integrations/supabase/client";

const rowSchema = z.object({
  matchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  opponent: z.string().trim().max(120).optional().nullable(),
  distanceKm: z.number().positive().lt(200),
  minutes: z.number().positive().max(150).default(90),
});

export const getTeamTracking = createServerFn({ method: "GET" })
  .inputValidator((input: { teamId: string }) => z.object({ teamId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const [{ data: team }, { data: rows }] = await Promise.all([
      browserSafe.from("teams").select("id, name").eq("id", data.teamId).maybeSingle(),
      browserSafe
        .from("team_tracking")
        .select("id, match_date, opponent, distance_km, minutes, source")
        .eq("team_id", data.teamId)
        .order("match_date", { ascending: false })
        .limit(500),
    ]);
    return {
      team,
      rows: (rows ?? []).map((r) => ({
        id: r.id,
        matchDate: r.match_date,
        opponent: r.opponent,
        distanceKm: Number(r.distance_km),
        minutes: Number(r.minutes),
        per90: Number(((Number(r.distance_km) / Number(r.minutes)) * 90).toFixed(2)),
      })),
    };
  });

export const saveTeamTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ teamId: z.string().uuid(), rows: z.array(rowSchema).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can upload tracking data.");
    const { error } = await context.supabase.from("team_tracking").upsert(
      data.rows.map((r) => ({
        team_id: data.teamId,
        match_date: r.matchDate,
        opponent: r.opponent ?? null,
        distance_km: r.distanceKm,
        minutes: r.minutes,
        source: "own",
        created_by: context.userId,
      })),
      { onConflict: "team_id,match_date" },
    );
    if (error) throw new Error("Could not save tracking data.");
    return { saved: data.rows.length };
  });

export const deleteTeamTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("team_tracking").delete().eq("id", data.id);
    if (error) throw new Error("Could not delete row.");
    return { ok: true };
  });
