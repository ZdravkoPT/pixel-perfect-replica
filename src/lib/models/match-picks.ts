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
  corners: number | null;
  injuries: number; // current injured/suspended
  avgSharpness: number | null; // 0-1 of expected starters
  avgLoad: number | null; // 0-1
  restDays: number | null;
  coachWinRate: number | null; // 0-1 career
  coachName: string | null;
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
  /** actual hit-rate / expected per market code, from settled past picks */
  calibration: Record<string, number>;
}

export interface MarketScore {
  code: string;
  market: string;
  selection: string;
  probability: number;
  agree: number;
  signals: number;
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
    m *= 1 - clamp(team.injuries, 0, 6) * 0.025; // missing players
    if (team.avgSharpness !== null) m *= 0.95 + team.avgSharpness * 0.1;
    if (team.avgLoad !== null && team.avgLoad > 0.8) m *= 0.97;
    if (team.restDays !== null && opp.restDays !== null) m *= 1 + clamp(team.restDays - opp.restDays, -4, 4) * 0.008;
    if (team.shotsOnTarget !== null && opp.shotsOnTarget !== null) {
      m *= 1 + clamp((team.shotsOnTarget - opp.shotsOnTarget) / 10, -0.08, 0.08);
    }
    if (team.coachWinRate !== null && opp.coachWinRate !== null) {
      m *= 1 + clamp(team.coachWinRate - opp.coachWinRate, -0.2, 0.2) * 0.15;
    }
    return clamp(m, 0.8, 1.2);
  };
  lh *= adj(home, away);
  la *= adj(away, home);
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

  type Def = { code: string; market: string; selection: string; m: number; f: number | null; h: number | null };
  const defs: Def[] = [
    { code: "home", market: "1X2", selection: `${input.homeName} win`, m: model.home, f: f?.home ?? null, h: hh?.home ?? null },
    { code: "away", market: "1X2", selection: `${input.awayName} win`, m: model.away, f: f?.away ?? null, h: hh?.away ?? null },
    { code: "dc_home", market: "Double chance", selection: `${input.homeName} or draw`, m: model.home + model.draw, f: f ? f.home + f.draw : null, h: hh ? hh.home + hh.draw : null },
    { code: "dc_away", market: "Double chance", selection: `${input.awayName} or draw`, m: model.away + model.draw, f: f ? f.away + f.draw : null, h: hh ? hh.away + hh.draw : null },
    { code: "dc_nodraw", market: "Double chance", selection: "Either team wins", m: model.home + model.away, f: f ? 1 - f.draw : null, h: hh ? 1 - hh.draw : null },
    { code: "over15", market: "Goals", selection: "Over 1.5 goals", m: model.o15, f: f?.o15 ?? null, h: null },
    { code: "over25", market: "Goals", selection: "Over 2.5 goals", m: model.o25, f: f?.o25 ?? null, h: hh?.o25 ?? null },
    { code: "under25", market: "Goals", selection: "Under 2.5 goals", m: 1 - model.o25, f: f ? 1 - f.o25 : null, h: hh ? 1 - hh.o25 : null },
    { code: "under35", market: "Goals", selection: "Under 3.5 goals", m: 1 - model.o35, f: f ? 1 - f.o35 : null, h: null },
    { code: "btts", market: "Both teams to score", selection: "Yes", m: model.btts, f: f?.btts ?? null, h: hh?.btts ?? null },
    { code: "btts_no", market: "Both teams to score", selection: "No", m: 1 - model.btts, f: f ? 1 - f.btts : null, h: hh ? 1 - hh.btts : null },
    { code: "home_scores", market: "Team to score", selection: `${input.homeName} to score`, m: model.hs, f: f?.hs ?? null, h: null },
    { code: "away_scores", market: "Team to score", selection: `${input.awayName} to score`, m: model.as, f: f?.as ?? null, h: null },
  ];

  const reliability = input.lineupStatus === "confirmed" ? 1 : input.lineupStatus === "projected" ? 0.97 : 0.94;
  const scores: MarketScore[] = defs.map((d) => {
    const parts: Array<[number, number]> = [[d.m, 0.5]];
    if (d.f !== null) parts.push([d.f, 0.3]);
    if (d.h !== null) parts.push([d.h, 0.2]);
    const w = parts.reduce((a, [, x]) => a + x, 0);
    let p = parts.reduce((a, [v, x]) => a + v * x, 0) / w;
    const cal = input.calibration[d.code];
    if (cal !== undefined) p *= clamp(cal, 0.85, 1.05);
    p = clamp(p * reliability, 0.01, 0.97);
    const signals = parts.length;
    const agree = parts.filter(([v]) => v >= 0.5).length;
    return { code: d.code, market: d.market, selection: d.selection, probability: p, agree, signals };
  });

  const eligible = scores
    .filter((s) => s.agree === s.signals && s.signals >= 2 && s.probability >= 0.62)
    .sort((a, b) => b.probability * (1 + 0.04 * b.signals) - a.probability * (1 + 0.04 * a.signals));
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
  if (hOk && h2h) reasons.push(`Head-to-head (last ${h2h.matches}): ${h2h.homeWins}W ${h2h.draws}D ${h2h.awayWins}L for ${input.homeName}, over 2.5 in ${pct(h2h.over25)}.`);
  if (home.injuries || away.injuries) reasons.push(`Unavailable players: ${input.homeName} ${home.injuries}, ${input.awayName} ${away.injuries}.`);
  if (home.coachWinRate !== null && away.coachWinRate !== null && Math.abs(home.coachWinRate - away.coachWinRate) >= 0.08) {
    reasons.push(`Managers' career win rate: ${home.coachName ?? "home"} ${pct(home.coachWinRate)} vs ${away.coachName ?? "away"} ${pct(away.coachWinRate)}.`);
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
