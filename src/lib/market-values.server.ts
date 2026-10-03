/**
 * Squad market values. Transfermarkt blocks automated access (and the community
 * transfermarkt-api mirror is down), so values are summed from the per-player
 * market values FotMob publishes, for each club's current squad. A club is
 * only valued when at least 11 of its current players carry a value.
 */
export function parseValueLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = /([\d.,]+)\s*(bn|b|m|k)?/i.exec(label.replace(/\s/g, ""));
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  const mult = unit === "bn" || unit === "b" ? 1e9 : unit === "m" ? 1e6 : unit === "k" ? 1e3 : 1;
  return Math.round(n * mult);
}

export async function computeSquadValues() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const members: Array<{ player_id: string; team_id: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabaseAdmin.from("squad_memberships").select("player_id, team_id")
      .eq("is_current", true).range(from, from + 999);
    members.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const values = new Map<string, number>();
  const ids = [...new Set(members.map((m) => m.player_id))];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabaseAdmin.from("player_careers").select("player_id, market_value_label").in("player_id", ids.slice(i, i + 300));
    for (const r of data ?? []) {
      const v = parseValueLabel(r.market_value_label);
      if (v) values.set(r.player_id, v);
    }
  }
  const byTeam = new Map<string, { sum: number; n: number }>();
  for (const m of members) {
    const v = values.get(m.player_id);
    if (!v) continue;
    const e = byTeam.get(m.team_id) ?? { sum: 0, n: 0 };
    e.sum += v; e.n += 1; byTeam.set(m.team_id, e);
  }
  const rows = [...byTeam].filter(([, e]) => e.n >= 11)
    .map(([team_id, e]) => ({ team_id, squad_value_eur: e.sum, source: "fotmob", fetched_at: new Date().toISOString() }));
  if (rows.length) {
    const { error } = await supabaseAdmin.from("market_values").insert(rows);
    if (error) throw new Error(error.message);
  }
  return { teamsValued: rows.length, playersWithValue: values.size };
}
