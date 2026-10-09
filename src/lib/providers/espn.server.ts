/**
 * ESPN public site API (free, no key) — backup for team match statistics when
 * FotMob has nothing for a finished game. Only observed numbers are returned.
 */
import { namesMatch } from "./normalize";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/all";
type Ev = { id: string; home: string; away: string };
const dayCache = new Map<string, Ev[]>();

async function eventsOn(day: string): Promise<Ev[]> {
  if (dayCache.has(day)) return dayCache.get(day)!;
  const res = await fetch(`${BASE}/scoreboard?dates=${day}&limit=500`);
  const out: Ev[] = [];
  if (res.ok) {
    const d = (await res.json()) as { events?: Array<{ id: string; competitions?: Array<{ competitors?: Array<{ homeAway: string; team?: { displayName?: string } }> }> }> };
    for (const e of d.events ?? []) {
      const c = e.competitions?.[0]?.competitors ?? [];
      const h = c.find((x) => x.homeAway === "home")?.team?.displayName, a = c.find((x) => x.homeAway === "away")?.team?.displayName;
      if (h && a) out.push({ id: e.id, home: h, away: a });
    }
  }
  dayCache.set(day, out);
  return out;
}

export async function findEspnEvent(kickoffISO: string, home: string, away: string): Promise<string | null> {
  const t = new Date(kickoffISO).getTime();
  for (const off of [0, -1, 1]) {
    const day = new Date(t + off * 86400e3).toISOString().slice(0, 10).replace(/-/g, "");
    const ev = (await eventsOn(day)).find((e) => namesMatch(e.home, home, 0.85) && namesMatch(e.away, away, 0.85));
    if (ev) return ev.id;
  }
  return null;
}

export type EspnBox = { corners: number | null; yellow_cards: number | null; red_cards: number | null; fouls: number | null; offsides: number | null; shots: number | null; shots_on_target: number | null; possession: number | null; passes: number | null; pass_accuracy: number | null };

export async function getEspnBox(eventId: string): Promise<{ home: EspnBox; away: EspnBox } | null> {
  const res = await fetch(`${BASE}/summary?event=${eventId}`);
  if (!res.ok) return null;
  const d = (await res.json()) as { boxscore?: { teams?: Array<{ homeAway: string; statistics?: Array<{ name: string; displayValue: string }> }> } };
  const parse = (side: string): EspnBox | null => {
    const s = d.boxscore?.teams?.find((t) => t.homeAway === side)?.statistics;
    if (!s?.length) return null;
    const n = (k: string) => { const v = s.find((x) => x.name === k)?.displayValue; const f = v == null || v === "" ? NaN : Number(v); return Number.isFinite(f) ? f : null; };
    const acc = n("accuratePasses"), tot = n("totalPasses");
    return {
      corners: n("wonCorners"), yellow_cards: n("yellowCards"), red_cards: n("redCards"), fouls: n("foulsCommitted"), offsides: n("offsides"),
      shots: n("totalShots"), shots_on_target: n("shotsOnTarget"), possession: n("possessionPct"), passes: tot,
      pass_accuracy: acc != null && tot ? Math.round((acc / tot) * 1000) / 10 : null,
    };
  };
  const home = parse("home"), away = parse("away");
  if (!home || !away || (home.shots == null && home.possession == null)) return null;
  return { home, away };
}
