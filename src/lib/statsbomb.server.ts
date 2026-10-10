/**
 * Free StatsBomb open-data shots (GitHub), converted to the FotMob pitch
 * (105×68, goal centre at 105,34). Used only as extra training shots for our
 * own xG model — never shown as match data.
 */
import type { ShotIn } from "./shot-xg.server";

const BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data";
// World Cup 2022, Euro 2024, Euro 2020
const COMPS: Array<[number, number]> = [[43, 106], [55, 282], [55, 43]];

export async function fetchStatsbombShots(opts: { maxMatches?: number; budgetMs?: number } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 60_000);
  const max = opts.maxMatches ?? 60;
  const ids: number[] = [];
  for (const [c, s] of COMPS) {
    try {
      const r = await fetch(`${BASE}/matches/${c}/${s}.json`);
      if (r.ok) ids.push(...((await r.json()) as any[]).map((m) => m.match_id));
    } catch { /* skip */ }
  }
  const out: Array<ShotIn & { is_goal: boolean }> = [];
  for (const id of ids.slice(0, max)) {
    if (Date.now() > deadline) break;
    try {
      const r = await fetch(`${BASE}/events/${id}.json`);
      if (!r.ok) continue;
      const ev = (await r.json()) as any[];
      for (const e of ev) {
        if (e.type?.name !== "Shot" || !e.location) continue;
        const t = e.shot?.type?.name ?? "", pp = e.play_pattern?.name ?? "";
        const situation = t === "Penalty" ? "penalty"
          : t === "Free Kick" || /Free Kick/.test(pp) ? "freekick"
          : t === "Corner" || /Corner/.test(pp) ? "corner"
          : /Counter/.test(pp) ? "fastbreak" : "regular";
        out.push({
          x: (e.location[0] * 105) / 120,
          y: (e.location[1] * 68) / 80,
          situation,
          shot_type: e.shot?.body_part?.name === "Head" ? "header" : "foot",
          is_goal: e.shot?.outcome?.name === "Goal",
        });
      }
    } catch { /* skip */ }
  }
  return out;
}
