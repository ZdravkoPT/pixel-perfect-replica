/**
 * Match-picks scorer: for one fixture, combine every stored signal into a
 * probability per market, measure how many independent signals agree, and
 * return the single strongest pick (or a "no bet" reason). Pure functions.
 */
import { poissonPmf } from "./poisson";

export interface TeamForm {
  matches: number;
  gf: number; // avg goals for
  ga: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number;
  scored: number; // share of games scoring
  last5: string;
}

export interface TeamExtras {
  shotsOnTarget: number | null; // avg per game, real box scores
  xgFor?: number | null; // avg real xG created per game (last 10 with data)
  xgAgainst?: number | null;
  squadValue?: number | null; // EUR, current squad
  corners: number | null;
  injuries: number; // current injured/suspended
  avgSharpness: number | null; // 0-1 of expected starters
  avgLoad: number | null; // 0-1
  restDays: number | null;
  coachWinRate: number | null; // 0-1 career
  coachName: string | null;
  /** share of the team's minutes held by currently unavailable players (0 = none); null when unknown */
  missingShare?: number | null;
  /** names of unavailable regulars (minutes share >= 50%) */
  keyAbsent?: string[];
  /** competitive games played in the 14 days before kickoff */
  games14?: number | null;
  /** current league position from this season's finished games (null when no table) */
  table?: { pos: number; pts: number; played: number; size: number; leaderPts?: number; fourthPts?: number; dropPts?: number; safePts?: number } | null;
  /** plays another competition within 3 days after this game */
  cupSoon?: boolean;
  /** available regulars clearly in form (score >= 75) or out of form (< 40), "Name 82" */
  keyForm?: { hot: string[]; cold: string[] } | null;
}

export type Motivation = "title" | "europe" | "relegation" | "nothing" | null;
/** What a team is playing for, from this season's table (late season only). */
export function motivationOf(t: TeamExtras["table"]): Motivation {
  if (!t || t.leaderPts == null || t.fourthPts == null || t.dropPts == null || t.safePts == null) return null;
  const left = Math.max(0, 2 * (t.size - 1) - t.played);
  if (left > 12 || left === 0) return null;
  const reach = 3 * left;
  if (t.pos <= 3 && t.leaderPts - t.pts <= Math.min(reach, 6)) return "title";
  if (t.pos >= t.size - 4 && t.pts - t.dropPts <= 6 && t.safePts + reach >= t.pts) return "relegation";
  if (t.pos >= 3 && t.pos <= 7 && Math.abs(t.fourthPts - t.pts) <= 4) return "europe";
  if (t.pts + reach < t.fourthPts && t.pts - t.dropPts > reach) return "nothing";
  return null;
}

export interface H2H {
  matches: number;
  homeWins: number; // for the current home side
  draws: number;
  awayWins: number;
  over25: number; // share
  btts: number;
}

export interface PickInput {
  homeName: string;
  awayName: string;
  lambdaHome: number | null;
  lambdaAway: number | null;
  lineupStatus: "confirmed" | "projected" | "none";
  homeForm: TeamForm | null;
  awayForm: TeamForm | null;
  home: TeamExtras;
  away: TeamExtras;
  h2h: H2H | null;
  elo: { home: number; away: number; neutral: boolean } | null;
  /** Probabilities from the weekly model-competition winner (league history). */
  champion?: { name: string; home: number; draw: number; away: number; o25: number; btts: number } | null;
  corners: { expected: number; overShare: number; samples: number } | null;
  cards: { expected: number; overShare: number; samples: number; refereeAvg: number | null } | null;
  /** actual hit-rate / expected per market code, from settled past picks */
  calibration: Record<string, number>;
  /** weight multiplier per source (model/form/h2h/elo/champion), learned from settled picks */
  sourceWeights?: Record<string, number>;
  /** market codes whose recent settled picks hit under 60%: they need ≥0.70 to be picked */
  weakMarkets?: string[];
  /** kickoff weather forecast + away travel (null when unknown) */
  context?: { rainMm: number | null; windKmh: number | null; tempC: number | null; awayTravelKm: number | null } | null;
}

export interface MarketScore {
  code: string;
  market: string;
  selection: string;
  probability: number;
  agree: number;
  signals: number;
  sources?: Array<{ name: string; p: number }>;
}

export interface PickResult {
  pick: MarketScore | null;
  confidence: "high" | "medium" | null;
  reasons: string[];
  noBetReason: string | null;
  alternatives: MarketScore[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${Math.round(v * 100)}%`;

function scoreGrid(lh: number, la: number) {
  let home = 0, draw = 0, away = 0, o15 = 0, o25 = 0, o35 = 0, btts = 0, hs = 0, as = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const p = poissonPmf(i, lh) * poissonPmf(j, la);
      if (i > j) home += p; else if (i === j) draw += p; else away += p;
      if (i + j > 1) o15 += p;
      if (i + j > 2) o25 += p;
      if (i + j > 3) o35 += p;
      if (i > 0 && j > 0) btts += p;
      if (i > 0) hs += p;
      if (j > 0) as += p;
    }
  }
  return { home, draw, away, o15, o25, o35, btts, hs, as };
}

export function scoreMatch(input: PickInput): PickResult {
  const { homeForm: hf, awayForm: af, home, away, h2h } = input;
  if (input.lambdaHome === null || input.lambdaAway === null) {
    return { pick: null, confidence: null, reasons: [], noBetReason: "No model prediction stored yet.", alternatives: [] };
  }

  // ---- adjust goal rates with real evidence (small, bounded nudges) --------
  let lh = input.lambdaHome;
  let la = input.lambdaAway;
  const adj = (team: TeamExtras, opp: TeamExtras) => {
    let m = 1;
    if (team.missingShare != null) {
      // weight each absence by how much that player actually plays (11 regulars = 11.0 share)
      m *= 1 - clamp(team.missingShare, 0, 4) * 0.035;
    } else {
      m *= 1 - clamp(team.injuries, 0, 6) * 0.025; // missing players (count only)
    }
    if (team.games14 != null && team.games14 >= 4) m *= 0.97; // fixture congestion
    const mot = motivationOf(team.table), oppMot = motivationOf(opp.table);
    if (mot === "nothing" && oppMot && oppMot !== "nothing") m *= 0.97; // opponent has more at stake
    if (team.cupSoon) m *= 0.98; // likely rotation
    if (team.keyForm) m *= 1 + clamp(team.keyForm.hot.length - team.keyForm.cold.length, -3, 3) * 0.01; // key players' form
    if (team.table && opp.table && team.table.size === opp.table.size) {
      // table gap (points per game), small bounded nudge
      const gap = team.table.pts / team.table.played - opp.table.pts / opp.table.played;
      m *= 1 + clamp(gap, -1.5, 1.5) * 0.03;
    }
    if (team.avgSharpness !== null) m *= 0.95 + team.avgSharpness * 0.1;
    if (team.avgLoad !== null && team.avgLoad > 0.8) m *= 0.97;
    if (team.restDays !== null && opp.restDays !== null) m *= 1 + clamp(team.restDays - opp.restDays, -4, 4) * 0.008;
    if (team.shotsOnTarget !== null && opp.shotsOnTarget !== null) {
      m *= 1 + clamp((team.shotsOnTarget - opp.shotsOnTarget) / 10, -0.08, 0.08);
    }
    if (team.xgFor != null && opp.xgAgainst != null) {
      // attack quality vs this opponent's chances conceded, centred on ~1.35 xG
      m *= 1 + clamp((team.xgFor + opp.xgAgainst) / 2 / 1.35 - 1, -0.12, 0.12) * 0.6;
    }
    if (team.squadValue && opp.squadValue) {
      m *= 1 + clamp(Math.log(team.squadValue / opp.squadValue), -1.5, 1.5) * 0.04;
    }
    if (team.coachWinRate !== null && opp.coachWinRate !== null) {
      m *= 1 + clamp(team.coachWinRate - opp.coachWinRate, -0.2, 0.2) * 0.15;
    }
    return clamp(m, 0.8, 1.2);
  };
  lh *= adj(home, away);
  la *= adj(away, home);
  const cx = input.context;
  if (cx) {
    // heavy rain / strong wind historically lowers scoring; long trips weigh on the away side
    let g = 1;
    if (cx.rainMm != null && cx.rainMm >= 2) g *= 0.96;
    if (cx.windKmh != null && cx.windKmh >= 30) g *= 0.96;
    lh *= g; la *= g;
    if (cx.awayTravelKm != null && cx.awayTravelKm >= 1500) la *= 0.98;
  }
  const model = scoreGrid(lh, la);

  // ---- form-based probabilities per market ---------------------------------
  const avg = (a: number | undefined, b: number | undefined) =>
    a === undefined || b === undefined ? null : (a + b) / 2;
  const formOk = (hf?.matches ?? 0) >= 5 && (af?.matches ?? 0) >= 5;
  const f = formOk && hf && af ? {
    home: (hf.winRate + af.lossRate) / 2,
    draw: (hf.drawRate + af.drawRate) / 2,
    away: (af.winRate + hf.lossRate) / 2,
    o15: avg(hf.over15, af.over15)!,
    o25: avg(hf.over25, af.over25)!,
    o35: avg(hf.over35, af.over35)!,
    btts: avg(hf.btts, af.btts)!,
    hs: hf.scored,
    as: af.scored,
  } : null;
  const hOk = h2h && h2h.matches >= 3;
  const hh = hOk ? {
    home: h2h.homeWins / h2h.matches,
    draw: h2h.draws / h2h.matches,
    away: h2h.awayWins / h2h.matches,
    o25: h2h.over25,
    btts: h2h.btts,
  } : null;

  // Elo: win expectancy -> 1X2 with an empirical draw share
  let e: { home: number; draw: number; away: number } | null = null;
  if (input.elo) {
    const diff = input.elo.home - input.elo.away + (input.elo.neutral ? 0 : 65);
    const we = 1 / (1 + Math.pow(10, -diff / 400));
    const draw = clamp(0.3 - 0.35 * Math.abs(we - 0.5), 0.12, 0.3);
    const h = clamp(we - draw / 2, 0.02, 0.96), a = clamp(1 - we - draw / 2, 0.02, 0.96);
    const sum = h + draw + a;
    e = { home: h / sum, draw: draw / sum, away: a / sum };
  }
  const tailOver = (lambda: number, line: number) => {
    let cdf = 0;
    for (let k = 0; k <= Math.floor(line); k++) cdf += poissonPmf(k, lambda);
    return 1 - cdf;
  };

  type Def = { code: string; market: string; selection: string; m: number; f: number | null; h: number | null; e?: number | null };
  const defs: Def[] = [
    { code: "home", market: "1X2", selection: `${input.homeName} win`, m: model.home, f: f?.home ?? null, h: hh?.home ?? null, e: e?.home ?? null },
    { code: "away", market: "1X2", selection: `${input.awayName} win`, m: model.away, f: f?.away ?? null, h: hh?.away ?? null, e: e?.away ?? null },
    { code: "dc_home", market: "Double chance", selection: `${input.homeName} or draw`, m: model.home + model.draw, f: f ? f.home + f.draw : null, h: hh ? hh.home + hh.draw : null, e: e ? e.home + e.draw : null },
    { code: "dc_away", market: "Double chance", selection: `${input.awayName} or draw`, m: model.away + model.draw, f: f ? f.away + f.draw : null, h: hh ? hh.away + hh.draw : null, e: e ? e.away + e.draw : null },
    { code: "dc_nodraw", market: "Double chance", selection: "Either team wins", m: model.home + model.away, f: f ? 1 - f.draw : null, h: hh ? 1 - hh.draw : null, e: e ? 1 - e.draw : null },
    { code: "over15", market: "Goals", selection: "Over 1.5 goals", m: model.o15, f: f?.o15 ?? null, h: null },
    { code: "over25", market: "Goals", selection: "Over 2.5 goals", m: model.o25, f: f?.o25 ?? null, h: hh?.o25 ?? null },
    { code: "under25", market: "Goals", selection: "Under 2.5 goals", m: 1 - model.o25, f: f ? 1 - f.o25 : null, h: hh ? 1 - hh.o25 : null },
    { code: "under35", market: "Goals", selection: "Under 3.5 goals", m: 1 - model.o35, f: f ? 1 - f.o35 : null, h: null },
    { code: "btts", market: "Both teams to score", selection: "Yes", m: model.btts, f: f?.btts ?? null, h: hh?.btts ?? null },
    { code: "btts_no", market: "Both teams to score", selection: "No", m: 1 - model.btts, f: f ? 1 - f.btts : null, h: hh ? 1 - hh.btts : null },
    { code: "home_scores", market: "Team to score", selection: `${input.homeName} to score`, m: model.hs, f: f?.hs ?? null, h: null },
    { code: "away_scores", market: "Team to score", selection: `${input.awayName} to score`, m: model.as, f: f?.as ?? null, h: null },
  ];
  if (input.corners && input.corners.samples >= 5) {
    const o = tailOver(input.corners.expected, 9.5);
    defs.push({ code: "corners_over95", market: "Corners", selection: "Over 9.5 corners", m: o, f: input.corners.overShare, h: null });
    defs.push({ code: "corners_under95", market: "Corners", selection: "Under 9.5 corners", m: 1 - o, f: 1 - input.corners.overShare, h: null });
  }
  if (input.cards && input.cards.samples >= 5) {
    const o = tailOver(input.cards.expected, 4.5);
    const r = input.cards.refereeAvg !== null ? tailOver(input.cards.refereeAvg, 4.5) : null;
    defs.push({ code: "cards_over45", market: "Cards", selection: "Over 4.5 cards", m: o, f: input.cards.overShare, h: r });
    defs.push({ code: "cards_under45", market: "Cards", selection: "Under 4.5 cards", m: 1 - o, f: 1 - input.cards.overShare, h: r === null ? null : 1 - r });
  }

  const c = input.champion ?? null;
  const champFor = (code: string): number | null => {
    if (!c) return null;
    const goalsReal = c.name !== "elo";
    switch (code) {
      case "home": return c.home;
      case "away": return c.away;
      case "dc_home": return c.home + c.draw;
      case "dc_away": return c.away + c.draw;
      case "dc_nodraw": return c.home + c.away;
      case "over25": return goalsReal ? c.o25 : null;
      case "under25": return goalsReal ? 1 - c.o25 : null;
      case "btts": return goalsReal ? c.btts : null;
      case "btts_no": return goalsReal ? 1 - c.btts : null;
      default: return null;
    }
  };

  const reliability = input.lineupStatus === "confirmed" ? 1 : input.lineupStatus === "projected" ? 0.97 : 0.94;
  const sw = (name: string) => clamp(input.sourceWeights?.[name] ?? 1, 0.4, 1.2);
  const scores: MarketScore[] = defs.map((d) => {
    const parts: Array<[number, number, string]> = [[d.m, 0.5 * sw("model"), "model"]];
    if (d.f !== null) parts.push([d.f, 0.3 * sw("form"), "form"]);
    if (d.h !== null) parts.push([d.h, 0.2 * sw("h2h"), "h2h"]);
    if (d.e !== undefined && d.e !== null) parts.push([d.e, 0.25 * sw("elo"), "elo"]);
    const cv = champFor(d.code);
    if (cv !== null) parts.push([cv, 0.3 * sw("champion"), "champion"]);
    const w = parts.reduce((a, [, x]) => a + x, 0);
    let p = parts.reduce((a, [v, x]) => a + v * x, 0) / w;
    const cal = input.calibration[d.code];
    if (cal !== undefined) p *= clamp(cal, 0.85, 1.05);
    p = clamp(p * reliability, 0.01, 0.97);
    const signals = parts.length;
    const agree = parts.filter(([v]) => v >= 0.5).length;
    const sources = parts.map(([v, , name]) => ({ name, p: Number(v.toFixed(3)) }));
    return { code: d.code, market: d.market, selection: d.selection, probability: p, agree, signals, sources };
  });

  // Rank by lift over each market's typical hit rate, so "safe" markets that
  // land most of the time anyway (e.g. either team wins) don't crowd out picks.
  const BASE: Record<string, number> = {
    home: 0.45, away: 0.3, dc_home: 0.72, dc_away: 0.55, dc_nodraw: 0.74,
    over15: 0.76, over25: 0.52, under25: 0.48, under35: 0.73, btts: 0.52, btts_no: 0.48,
    home_scores: 0.78, away_scores: 0.68,
    corners_over95: 0.5, corners_under95: 0.5, cards_over45: 0.45, cards_under45: 0.55,
  };
  const lift = (s: MarketScore) => {
    const b = BASE[s.code] ?? 0.5;
    return (s.probability - b) / (1 - b);
  };
  const eligible = scores
    .filter((s) => s.agree === s.signals && s.signals >= 2 && s.probability >= (input.weakMarkets?.includes(s.code) ? 0.7 : 0.62) && lift(s) >= 0.15)
    .sort((a, b) => lift(b) * (1 + 0.04 * b.signals) - lift(a) * (1 + 0.04 * a.signals));
  const pick = eligible[0] ?? null;

  if (!pick) {
    const best = [...scores].sort((a, b) => b.probability - a.probability)[0]!;
    return {
      pick: null,
      confidence: null,
      reasons: [],
      noBetReason: !formOk
        ? "Not enough recent results for both clubs to confirm the model."
        : `Signals disagree — best option (${best.selection}, ${pct(best.probability)}) lacks support from every source.`,
      alternatives: scores.sort((a, b) => b.probability - a.probability).slice(0, 3),
    };
  }

  const confidence = pick.probability >= 0.75 && pick.signals >= 3 ? "high" : pick.probability >= 0.7 ? "high" : "medium";

  // ---- reasons (facts only) ------------------------------------------------
  const reasons: string[] = [];
  reasons.push(`Model goal rates ${lh.toFixed(2)} – ${la.toFixed(2)} after adjustments.`);
  const goalsish = ["over15", "over25", "under25", "under35", "btts", "btts_no"].includes(pick.code);
  if (hf && af && formOk) {
    if (goalsish) {
      reasons.push(`Over 2.5 in ${pct(hf.over25)} of ${input.homeName}'s and ${pct(af.over25)} of ${input.awayName}'s recent games; BTTS ${pct(hf.btts)} / ${pct(af.btts)}.`);
    } else {
      reasons.push(`Recent form: ${input.homeName} ${hf.last5 || "–"} (${hf.gf.toFixed(1)} scored, ${hf.ga.toFixed(1)} conceded) vs ${input.awayName} ${af.last5 || "–"} (${af.gf.toFixed(1)} / ${af.ga.toFixed(1)}).`);
    }
  }
  if (c && champFor(pick.code) !== null) {
    reasons.push(`Best-tested model (${c.name.replace("_", "-")}, league history): ${pct(c.home)} / ${pct(c.draw)} / ${pct(c.away)}.`);
  }
  if (input.elo && e && ["home", "away", "dc_home", "dc_away", "dc_nodraw"].includes(pick.code)) {
    reasons.push(`Elo ratings ${Math.round(input.elo.home)} vs ${Math.round(input.elo.away)}${input.elo.neutral ? " (neutral venue)" : ""}: ${pct(e.home)} / ${pct(e.draw)} / ${pct(e.away)}.`);
  }
  if (pick.code.startsWith("corners") && input.corners) reasons.push(`Expected corners ${input.corners.expected.toFixed(1)}; over 9.5 in ${pct(input.corners.overShare)} of both sides' recent games.`);
  if (pick.code.startsWith("cards") && input.cards) reasons.push(`Expected cards ${input.cards.expected.toFixed(1)}${input.cards.refereeAvg !== null ? `, referee averages ${input.cards.refereeAvg.toFixed(1)}` : ""}; over 4.5 in ${pct(input.cards.overShare)} of recent games.`);
  if (hOk && h2h) reasons.push(`Head-to-head (last ${h2h.matches}): ${h2h.homeWins}W ${h2h.draws}D ${h2h.awayWins}L for ${input.homeName}, over 2.5 in ${pct(h2h.over25)}.`);
  if (home.injuries || away.injuries) reasons.push(`Unavailable players: ${input.homeName} ${home.injuries}, ${input.awayName} ${away.injuries}.`);
  const keys = [...(home.keyAbsent ?? []).map((n) => `${n} (${input.homeName})`), ...(away.keyAbsent ?? []).map((n) => `${n} (${input.awayName})`)];
  if (keys.length) reasons.push(`Key regulars missing: ${keys.slice(0, 4).join(", ")}.`);
  const fl = (t: TeamExtras, n: string) => [...(t.keyForm?.hot ?? []).map((x) => `${x} in form`), ...(t.keyForm?.cold ?? []).map((x) => `${x} out of form`)].map((x) => `${x} (${n})`);
  const forms = [...fl(home, input.homeName), ...fl(away, input.awayName)];
  if (forms.length) reasons.push(`Key players' form score: ${forms.slice(0, 4).join(", ")}.`);
  if (cx && ((cx.rainMm ?? 0) >= 2 || (cx.windKmh ?? 0) >= 30)) reasons.push(`Kickoff forecast: ${cx.tempC != null ? `${Math.round(cx.tempC)}°C, ` : ""}${(cx.rainMm ?? 0).toFixed(1)} mm rain, wind ${Math.round(cx.windKmh ?? 0)} km/h.`);
  if (cx?.awayTravelKm != null && cx.awayTravelKm >= 1500) reasons.push(`${input.awayName} travel about ${cx.awayTravelKm.toLocaleString("en")} km to this game.`);
  if ((home.games14 ?? 0) >= 4 || (away.games14 ?? 0) >= 4) reasons.push(`Games in last 14 days: ${input.homeName} ${home.games14 ?? "?"}, ${input.awayName} ${away.games14 ?? "?"}.`);
  if (home.table && away.table && Math.abs(home.table.pos - away.table.pos) >= 5) {
    const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
    reasons.push(`League table: ${input.homeName} ${ord(home.table.pos)} (${home.table.pts} pts) vs ${input.awayName} ${ord(away.table.pos)} (${away.table.pts} pts).`);
  }
  {
    const label: Record<string, string> = { title: "title race", europe: "fight for the top 4", relegation: "relegation fight", nothing: "nothing left to play for" };
    const parts = [[input.homeName, motivationOf(home.table)], [input.awayName, motivationOf(away.table)]]
      .filter(([, m]) => m).map(([n, m]) => `${n}: ${label[m as string]}`);
    if (parts.length) reasons.push(`What's at stake: ${parts.join("; ")}.`);
    const cup = [home.cupSoon && input.homeName, away.cupSoon && input.awayName].filter(Boolean);
    if (cup.length) reasons.push(`Another competition within 3 days (possible rotation): ${cup.join(", ")}.`);
  }
  if (home.coachWinRate !== null && away.coachWinRate !== null && Math.abs(home.coachWinRate - away.coachWinRate) >= 0.08) {
    reasons.push(`Managers' career win rate: ${home.coachName ?? "home"} ${pct(home.coachWinRate)} vs ${away.coachName ?? "away"} ${pct(away.coachWinRate)}.`);
  }
  if (home.squadValue && away.squadValue && Math.max(home.squadValue, away.squadValue) / Math.min(home.squadValue, away.squadValue) >= 1.5) {
    const f = (v: number) => (v >= 1e9 ? `€${(v / 1e9).toFixed(2)}bn` : `€${Math.round(v / 1e6)}m`);
    reasons.push(`Squad market value: ${input.homeName} ${f(home.squadValue)} vs ${input.awayName} ${f(away.squadValue)}.`);
  }
  if (home.xgFor != null && away.xgFor != null && home.xgAgainst != null && away.xgAgainst != null) {
    reasons.push(`xG per game (for/against): ${input.homeName} ${home.xgFor.toFixed(2)}/${home.xgAgainst.toFixed(2)}, ${input.awayName} ${away.xgFor.toFixed(2)}/${away.xgAgainst.toFixed(2)}.`);
  }
  if (home.shotsOnTarget !== null && away.shotsOnTarget !== null) {
    reasons.push(`Shots on target per game: ${home.shotsOnTarget.toFixed(1)} vs ${away.shotsOnTarget.toFixed(1)}.`);
  }
  if (home.restDays !== null && away.restDays !== null && Math.abs(home.restDays - away.restDays) >= 2) {
    reasons.push(`Rest: ${home.restDays} days vs ${away.restDays} days.`);
  }
  reasons.push(`${pick.agree} of ${pick.signals} independent sources agree; lineups ${input.lineupStatus === "none" ? "not yet known" : input.lineupStatus}.`);

  return {
    pick,
    confidence,
    reasons: reasons.slice(0, 6),
    noBetReason: null,
    alternatives: eligible.slice(1, 3),
  };
}
