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

/**
 * Every international match result (martj42/international_results on GitHub).
 * Stored as league_code "INT" so national-team form and head-to-head use it.
 */
export async function importInternational(opts: { years?: number } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const res = await fetch("https://raw.githubusercontent.com/martj42/international_results/master/results.csv");
  if (!res.ok) return { ok: false, upserted: 0, linked: 0, errors: [`source ${res.status}`] };
  const resolve = await buildTeamResolver(supabaseAdmin);
  const since = `${new Date().getUTCFullYear() - (opts.years ?? 8)}-01-01`;
  const text = await res.text();
  const lines = text.split(/\r?\n/).slice(1);
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let linked = 0;
  for (const line of lines) {
    // date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
    const c = line.split(",");
    if (c.length < 9 || c[0]! < since) continue;
    const hg = int(c[3]), ag = int(c[4]);
    if (hg === null || ag === null) continue;
    const key = `${c[0]}|${c[1]}|${c[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const h = resolve(c[1]!, { national: true }), a = resolve(c[2]!, { national: true });
    if (h && a) linked++;
    rows.push({
      league_code: "INT", season: c[0]!.slice(0, 4), match_date: c[0],
      home_name: c[1], away_name: c[2], home_team_id: h, away_team_id: a,
      home_goals: hg, away_goals: ag, referee: null, source: "martj42/international_results",
    });
  }
  let upserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin.from("historical_results")
      .upsert(rows.slice(i, i + 500) as never, { onConflict: "league_code,match_date,home_name,away_name" });
    if (error) errors.push(error.message); else upserted += Math.min(500, rows.length - i);
  }
  return { ok: errors.length === 0, upserted, linked, errors: errors.slice(0, 5) };
}

/** Lower leagues not in football-data.co.uk's set, from openfootball/football.json (GitHub). */
const OPENFOOTBALL: Array<[string, string]> = [["en.3", "E2"], ["en.4", "E3"], ["at.1", "A1"], ["at.2", "A2"]];

export async function importOpenfootball(opts: { seasons?: number } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const resolve = await buildTeamResolver(supabaseAdmin);
  let upserted = 0;
  const errors: string[] = [];
  for (const code of seasonCodes(opts.seasons ?? 3)) {
    const folder = `20${code.slice(0, 2)}-${code.slice(2)}`;
    for (const [file, league] of OPENFOOTBALL) {
      const res = await fetch(`https://raw.githubusercontent.com/openfootball/football.json/master/${folder}/${file}.json`);
      if (!res.ok) { if (res.status !== 404) errors.push(`${folder}/${file} [${res.status}]`); continue; }
      const data = (await res.json()) as { matches?: Array<{ date?: string; team1?: string; team2?: string; score?: { ft?: [number, number] } }> };
      const rows = (data.matches ?? [])
        .filter((m) => m.date && m.team1 && m.team2 && Array.isArray(m.score?.ft) && m.score!.ft!.length === 2)
        .map((m) => ({
          league_code: league, season: code, match_date: m.date!, home_name: m.team1!, away_name: m.team2!,
          home_team_id: resolve(m.team1!), away_team_id: resolve(m.team2!),
          home_goals: m.score!.ft![0], away_goals: m.score!.ft![1], source: "openfootball",
        }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabaseAdmin.from("historical_results")
          .upsert(rows.slice(i, i + 500), { onConflict: "league_code,match_date,home_name,away_name" });
        if (error) errors.push(`${folder}/${file}: ${error.message}`); else upserted += Math.min(500, rows.length - i);
      }
    }
  }
  return { upserted, errors: errors.slice(0, 10) };
}
