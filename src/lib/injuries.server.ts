/**
 * Turns FotMob injury notes (stored on player_conditions / player_careers)
 * into open rows in `injuries` with reason and expected return date, and
 * closes rows whose player no longer carries an injury note.
 */
type Note = { name?: string; expectedReturn?: { expectedReturnKey?: string; expectedReturnDateParam?: string; expectedReturnFallback?: string } };

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

export function parseReturn(n: Note | null): string | null {
  const er = n?.expectedReturn;
  const m = /([a-z]+)\s+(\d{4})/i.exec(er?.expectedReturnDateParam ?? "");
  if (!m) return null;
  const mi = MONTHS.indexOf((m[1] ?? "").toLowerCase());
  if (mi < 0) return null;
  const key = er?.expectedReturnKey ?? "";
  const day = key.includes("early") ? 5 : key.includes("late") ? 25 : 15;
  return `${m[2]}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function syncInjuries() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: cond }, { data: car }, { data: mem }] = await Promise.all([
    supabaseAdmin.from("player_conditions").select("player_id, team_id, injury, fetched_at"),
    supabaseAdmin.from("player_careers").select("player_id, injury, fetched_at"),
    supabaseAdmin.from("squad_memberships").select("player_id, team_id").eq("is_current", true),
  ]);
  const teamOf = new Map((mem ?? []).map((m) => [m.player_id, m.team_id]));
  // newest note per player wins (conditions refresh more often than careers)
  const latest = new Map<string, { note: Note | null; at: string; team: string | null }>();
  for (const r of [...(car ?? []), ...(cond ?? [])] as Array<{ player_id: string; team_id?: string | null; injury: unknown; fetched_at: string }>) {
    const prev = latest.get(r.player_id);
    if (prev && prev.at > r.fetched_at) continue;
    const note = typeof r.injury === "string" ? JSON.parse(r.injury) : (r.injury as Note | null);
    latest.set(r.player_id, { note, at: r.fetched_at, team: r.team_id ?? teamOf.get(r.player_id) ?? null });
  }
  const { data: open } = await supabaseAdmin.from("injuries").select("id, player_id").is("resolved_at", null).eq("kind", "injury");
  const openBy = new Map((open ?? []).map((o) => [o.player_id, o.id]));
  let opened = 0, updated = 0, resolved = 0;
  for (const [pid, { note, team }] of latest) {
    const id = openBy.get(pid);
    if (note?.name) {
      const row = { reason: note.name, expected_return: parseReturn(note), team_id: team, status: "out" };
      if (id) { await supabaseAdmin.from("injuries").update(row).eq("id", id); updated++; }
      else { await supabaseAdmin.from("injuries").insert({ ...row, player_id: pid, kind: "injury", source_id: "fotmob" }); opened++; }
    } else if (id) {
      await supabaseAdmin.from("injuries").update({ resolved_at: new Date().toISOString(), status: "resolved" }).eq("id", id);
      resolved++;
    }
  }
  return { opened, updated, resolved };
}
