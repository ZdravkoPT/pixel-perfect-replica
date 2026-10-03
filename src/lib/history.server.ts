/**
 * Long match history from football-data.co.uk (free CSVs): results plus shots,
 * corners, cards and referee for the main European leagues.
 */
import { buildTeamResolver } from "@/lib/team-resolver.server";

const LEAGUES = ["E0", "E1", "SC0", "D1", "D2", "I1", "I2", "SP1", "SP2", "F1", "F2", "N1", "B1", "P1", "T1", "G1"];

function seasonCodes(count: number): string[] {
  const now = new Date();
  let start = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++, start--) {
    out.push(`${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`);
  }
  return out;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0]!.split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    head.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

const int = (v: string | undefined) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

function isoDate(d: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{2,4})$/.exec(d);
  if (!m) return null;
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${y}-${m[2]}-${m[1]}`;
}

export async function importHistory(opts: { seasons?: number } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const resolve = await buildTeamResolver(supabaseAdmin);
  let inserted = 0;
  const errors: string[] = [];
  for (const season of seasonCodes(opts.seasons ?? 6)) {
    for (const league of LEAGUES) {
      const res = await fetch(`https://www.football-data.co.uk/mmz4281/${season}/${league}.csv`);
      if (!res.ok) { if (res.status !== 404) errors.push(`${season}/${league} [${res.status}]`); continue; }
      const rows = parseCsv(await res.text())
        .map((r) => {
          const date = isoDate(r["Date"] ?? "");
          const hg = int(r["FTHG"]), ag = int(r["FTAG"]);
          if (!date || hg === null || ag === null || !r["HomeTeam"] || !r["AwayTeam"]) return null;
          return {
            league_code: league, season, match_date: date,
            home_name: r["HomeTeam"]!, away_name: r["AwayTeam"]!,
            home_team_id: resolve(r["HomeTeam"]!), away_team_id: resolve(r["AwayTeam"]!),
            home_goals: hg, away_goals: ag,
            home_shots: int(r["HS"]), away_shots: int(r["AS"]),
            home_sot: int(r["HST"]), away_sot: int(r["AST"]),
            home_corners: int(r["HC"]), away_corners: int(r["AC"]),
            home_yellow: int(r["HY"]), away_yellow: int(r["AY"]),
            home_red: int(r["HR"]), away_red: int(r["AR"]),
            referee: r["Referee"] || null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabaseAdmin
          .from("historical_results")
          .upsert(rows.slice(i, i + 500), { onConflict: "league_code,match_date,home_name,away_name" });
        if (error) errors.push(`${season}/${league}: ${error.message}`); else inserted += Math.min(500, rows.length - i);
      }
    }
  }
  return { ok: errors.length === 0, upserted: inserted, errors: errors.slice(0, 20) };
}
