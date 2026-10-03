/** Club Elo (clubelo.com) and national-team Elo (eloratings.net) import. */
import { buildTeamResolver } from "@/lib/team-resolver.server";

export async function importElo() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const resolve = await buildTeamResolver(supabaseAdmin);
  const errors: string[] = [];
  let national = 0, club = 0;

  // National teams
  try {
    const [worldRes, namesRes] = await Promise.all([
      fetch("https://www.eloratings.net/World.tsv"),
      fetch("https://www.eloratings.net/en.teams.tsv"),
    ]);
    if (!worldRes.ok || !namesRes.ok) throw new Error(`eloratings [${worldRes.status}/${namesRes.status}]`);
    const names = new Map<string, string>();
    for (const line of (await namesRes.text()).split("\n")) {
      const [code, name] = line.split("\t");
      if (code && name && !names.has(code)) names.set(code, name.trim());
    }
    const rows = (await worldRes.text()).split("\n").map((line) => {
      const c = line.split("\t");
      const name = names.get(c[2] ?? "");
      const rating = Number(c[3]);
      if (!name || !Number.isFinite(rating)) return null;
      return {
        kind: "national", name, code: c[2]!, rating, rank: Number(c[0]) || null,
        team_id: resolve(name, { national: true }), source: "eloratings.net", as_of: new Date().toISOString(),
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
    const { error } = await supabaseAdmin.from("elo_ratings").upsert(rows, { onConflict: "kind,name" });
    if (error) errors.push(error.message); else national = rows.length;
  } catch (e) {
    errors.push(String(e));
  }

  // Clubs
  try {
    const day = new Date().toISOString().slice(0, 10);
    const res = await fetch(`http://api.clubelo.com/${day}`);
    if (!res.ok) throw new Error(`clubelo [${res.status}]`);
    const lines = (await res.text()).split("\n").slice(1).filter(Boolean);
    const rows = lines.map((line) => {
      const [rank, name, country, , elo] = line.split(",");
      const rating = Number(elo);
      if (!name || !Number.isFinite(rating)) return null;
      return {
        kind: "club", name, code: country ?? null, rating, rank: Number(rank) || null,
        team_id: resolve(name), source: "clubelo.com", as_of: new Date().toISOString(),
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length === 0) throw new Error("clubelo returned no rows");
    const { error } = await supabaseAdmin.from("elo_ratings").upsert(rows, { onConflict: "kind,name" });
    if (error) errors.push(error.message); else club = rows.length;
  } catch (e) {
    errors.push(String(e));
  }
  return { ok: errors.length === 0, national, club, errors };
}
