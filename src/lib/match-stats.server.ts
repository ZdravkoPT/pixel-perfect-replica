import type { MatchFacts } from "./providers/fotmob.server";

/**
 * Imports real per-team box-score statistics (possession, shots, corners,
 * fouls, cards, offsides, passes, pass accuracy) from FotMob match details
 * for recently finished fixtures into team_match_stats.
 */
function num(text: string | undefined): number | null {
  if (!text) return null;
  const m = /-?\d+(\.\d+)?/.exec(text);
  return m ? Number(m[0]) : null;
}
function pctIn(text: string | undefined): number | null {
  if (!text) return null;
  const m = /\((\d+(?:\.\d+)?)%\)/.exec(text);
  return m ? Number(m[1]) : null;
}

export function parseBoxScore(facts: MatchFacts) {
  const find = (...titles: string[]) => {
    for (const group of facts.statGroups) {
      for (const item of group.items) {
        const t = item.title.toLowerCase();
        if (titles.some((x) => t === x)) return item;
      }
    }
    return null;
  };
  const side = (key: "home" | "away") => {
    const g = (...t: string[]) => find(...t)?.[key];
    const accurate = g("accurate passes");
    return {
      possession: num(g("ball possession", "possession")),
      shots: num(g("total shots", "shots")),
      shots_on_target: num(g("shots on target")),
      corners: num(g("corners", "corner kicks")),
      fouls: num(g("fouls committed", "fouls")),
      offsides: num(g("offsides")),
      yellow_cards: num(g("yellow cards")),
      red_cards: num(g("red cards")),
      passes: num(g("passes", "total passes")),
      pass_accuracy: pctIn(accurate),
    };
  };
  const home = side("home");
  const away = side("away");
  const any = Object.values(home).some((v) => v != null);
  return any ? { home, away } : null;
}

export async function ingestMatchStats(opts: { days?: number; limit?: number; triggeredBy?: string } = {}) {
  const days = opts.days ?? 60;
  const limit = opts.limit ?? 80;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { FotmobProvider } = await import("./providers/fotmob.server");
  const fotmob = new FotmobProvider();

  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data: done } = await supabaseAdmin
    .from("team_match_stats")
    .select("match_id")
    .gte("created_at", new Date(Date.now() - 400 * 86400_000).toISOString())
    .limit(20000);
  const have = new Set((done ?? []).map((r) => r.match_id));

  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("id, kickoff_at, home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)")
    .eq("status", "FINISHED")
    .gte("kickoff_at", since)
    .order("kickoff_at", { ascending: false })
    .limit(2000);

  const todo = (matches ?? []).filter((m) => !have.has(m.id)).slice(0, limit);
  let imported = 0;
  let missing = 0;
  for (const m of todo) {
    try {
      const home = (m as unknown as { home: { name: string } | null }).home?.name ?? "";
      const away = (m as unknown as { away: { name: string } | null }).away?.name ?? "";
      const { data: src } = await supabaseAdmin
        .from("match_sources")
        .select("provider_match_id")
        .eq("match_id", m.id)
        .eq("source_id", "fotmob")
        .maybeSingle();
      let pid = src?.provider_match_id ?? null;
      if (!pid) {
        pid = await fotmob.findMatchId(m.kickoff_at, home, away);
        if (pid) {
          await supabaseAdmin
            .from("match_sources")
            .upsert({ match_id: m.id, source_id: "fotmob", provider_match_id: pid }, { onConflict: "source_id,provider_match_id", ignoreDuplicates: true });
        }
      }
      if (!pid) {
        missing += 1;
        continue;
      }
      const res = await fotmob.getMatchFacts(pid);
      const box = res.ok ? parseBoxScore(res.data) : null;
      if (!box) {
        missing += 1;
        continue;
      }
      await supabaseAdmin.from("team_match_stats").upsert(
        [
          { match_id: m.id, team_id: m.home_team_id, is_home: true, ...box.home, payload: { source: "fotmob" } },
          { match_id: m.id, team_id: m.away_team_id, is_home: false, ...box.away, payload: { source: "fotmob" } },
        ],
        { onConflict: "match_id,team_id" },
      );
      imported += 1;
      await new Promise((r) => setTimeout(r, 120));
    } catch {
      missing += 1;
    }
  }
  return { candidates: todo.length, imported, missing, triggeredBy: opts.triggeredBy ?? "manual" };
}
