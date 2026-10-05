import { createServerFn } from "@tanstack/react-start";
import { publicClient } from "./leagues.functions";

export type StyleMetric = { key: string; label: string; value: number; pct: number };
export type TeamStyle = { samples: number; metrics: StyleMetric[]; tags: string[] };

const KEYS = [
  ["possession", "Possession %"],
  ["shots", "Shots"],
  ["shots_on_target", "Shots on target"],
  ["pass_accuracy", "Pass accuracy %"],
  ["corners", "Corners"],
  ["fouls", "Fouls"],
] as const;
type K = (typeof KEYS)[number][0];

/** Team style from its last 10 real box scores, ranked against every team's averages. Blank if under 5 games. */
export const getTeamStyle = createServerFn({ method: "GET" })
  .inputValidator((input: { teamId: string }) => input)
  .handler(async ({ data }): Promise<TeamStyle | null> => {
    const sb = publicClient();
    const { data: rows } = await sb
      .from("team_match_stats")
      .select("team_id, possession, shots, shots_on_target, pass_accuracy, corners, fouls, created_at")
      .order("created_at", { ascending: false })
      .limit(6000);
    const byTeam = new Map<string, typeof rows>();
    for (const r of rows ?? []) {
      const a = byTeam.get(r.team_id) ?? [];
      if (a.length < 10) a.push(r);
      byTeam.set(r.team_id, a);
    }
    const avgs = new Map<string, Partial<Record<K, number>>>();
    for (const [tid, list] of byTeam) {
      if ((list ?? []).length < 5) continue;
      const o: Partial<Record<K, number>> = {};
      for (const [k] of KEYS) {
        const v = (list ?? []).map((r) => r[k]).filter((x): x is number => x != null).map(Number);
        if (v.length >= 5) o[k] = v.reduce((a, b) => a + b, 0) / v.length;
      }
      avgs.set(tid, o);
    }
    const mine = avgs.get(data.teamId);
    if (!mine) return null;
    const metrics: StyleMetric[] = [];
    for (const [k, label] of KEYS) {
      const v = mine[k];
      if (v == null) continue;
      const all = [...avgs.values()].map((o) => o[k]).filter((x): x is number => x != null);
      const pct = Math.round((all.filter((x) => x < v).length / Math.max(1, all.length - 1)) * 100);
      metrics.push({ key: k, label, value: Number(v.toFixed(1)), pct: Math.min(100, pct) });
    }
    const p = (k: string) => metrics.find((m) => m.key === k)?.pct;
    const tags: string[] = [];
    if ((p("possession") ?? 50) >= 70) tags.push("Keeps the ball");
    if ((p("possession") ?? 50) <= 30) tags.push("Plays without the ball");
    if ((p("shots") ?? 50) >= 70) tags.push("High shot volume");
    if ((p("shots") ?? 50) <= 30) tags.push("Few shots");
    if ((p("pass_accuracy") ?? 50) >= 70) tags.push("Precise passing");
    if ((p("fouls") ?? 50) >= 75) tags.push("Physical, fouls a lot");
    if ((p("corners") ?? 50) >= 75) tags.push("Wins many corners");
    return { samples: (byTeam.get(data.teamId) ?? []).length, metrics, tags };
  });
