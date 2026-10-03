/**
 * Weekly model competition (ideas ported from penaltyblog): several goal models
 * are replayed walk-forward over the imported league history, each match
 * predicted only from earlier matches. They are ranked by 1X2 log loss; the
 * winner's current team ratings are stored so Match Picks can use it.
 */
type Row = {
  league_code: string; match_date: string; home_name: string; away_name: string;
  home_team_id: string | null; away_team_id: string | null; home_goals: number; away_goals: number; home_xg: number | null; away_xg: number | null;
};
export type Probs = { home: number; draw: number; away: number; o25: number; btts: number };
export type ModelName = "baseline" | "poisson" | "dixon_coles" | "elo" | "bivariate" | "zero_inflated" | "ensemble" | "xg_dixon_coles";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
function pmf(k: number, l: number) { let f = 1; for (let i = 2; i <= k; i++) f *= i; return Math.exp(-l) * Math.pow(l, k) / f; }

export function goalProbs(lh: number, la: number, rho = 0): Probs {
  let h = 0, d = 0, a = 0, o = 0, b = 0, tot = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    let p = pmf(i, lh) * pmf(j, la);
    if (rho) {
      if (i === 0 && j === 0) p *= 1 - lh * la * rho;
      else if (i === 0 && j === 1) p *= 1 + lh * rho;
      else if (i === 1 && j === 0) p *= 1 + la * rho;
      else if (i === 1 && j === 1) p *= 1 - rho;
    }
    tot += p;
    if (i > j) h += p; else if (i === j) d += p; else a += p;
    if (i + j > 2) o += p;
    if (i > 0 && j > 0) b += p;
  }
  return { home: h / tot, draw: d / tot, away: a / tot, o25: o / tot, btts: b / tot };
}

/** Bivariate Poisson (Karlis & Ntzoufras): shared component l3 links both teams' goals. */
export function bivariateProbs(lh: number, la: number, l3 = 0.12): Probs {
  const l1 = Math.max(0.05, lh - l3), l2 = Math.max(0.05, la - l3);
  let h = 0, d = 0, a = 0, o = 0, b = 0, tot = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    let p = 0;
    for (let k = 0; k <= Math.min(i, j); k++) p += pmf(i - k, l1) * pmf(j - k, l2) * pmf(k, l3);
    tot += p;
    if (i > j) h += p; else if (i === j) d += p; else a += p;
    if (i + j > 2) o += p;
    if (i > 0 && j > 0) b += p;
  }
  return { home: h / tot, draw: d / tot, away: a / tot, o25: o / tot, btts: b / tot };
}

/** Zero-inflated Poisson: extra probability mass w on a 0-0 draw. */
export function zeroInflatedProbs(lh: number, la: number, w = 0.04): Probs {
  const g = goalProbs(lh, la, 0);
  return { home: g.home * (1 - w), draw: g.draw * (1 - w) + w, away: g.away * (1 - w), o25: g.o25 * (1 - w), btts: g.btts * (1 - w) };
}

const avgProbs = (x: Probs, y: Probs): Probs => ({
  home: (x.home + y.home) / 2, draw: (x.draw + y.draw) / 2, away: (x.away + y.away) / 2, o25: (x.o25 + y.o25) / 2, btts: (x.btts + y.btts) / 2,
});

export function eloProbs(rh: number, ra: number, drawRate = 0.26): Probs {
  const we = 1 / (1 + Math.pow(10, -(rh - ra + 60) / 400));
  const draw = clamp(drawRate * (1 - 1.2 * Math.abs(we - 0.5)), 0.1, 0.32);
  const h = Math.max(0.02, we - draw / 2), a = Math.max(0.02, 1 - we - draw / 2);
  const s = h + draw + a;
  return { home: h / s, draw: draw / s, away: a / s, o25: 0.5, btts: 0.5 };
}

type League = { n: number; h: number; a: number; hw: number; d: number; aw: number };
type Ew = { gf: number; ga: number; n: number };
type Dc = { gf: number; ga: number; w: number; last: number };

export async function runModelCompetition(opts: { triggeredBy?: string } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from("historical_results")
      .select("league_code, match_date, home_name, away_name, home_team_id, away_team_id, home_goals, away_goals, home_xg, away_xg")
      .not("home_goals", "is", null).not("away_goals", "is", null)
      .order("match_date").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  if (rows.length < 500) throw new Error(`Not enough history (${rows.length} matches).`);

  const evalFrom = new Date(new Date(rows[rows.length - 1]!.match_date).getTime() - 730 * 86400e3).getTime();
  const lg = new Map<string, League>();
  const ew = new Map<string, Ew>();
  const dc = new Map<string, Dc>();
  const dx = new Map<string, Dc>(); // Dixon-Coles on goals blended 50/50 with xG when known
  const elo = new Map<string, number>();
  const ids = new Map<string, string>();
  const XI = 0.0019; // per-day decay (Dixon-Coles)
  const names: ModelName[] = ["baseline", "poisson", "dixon_coles", "elo", "bivariate", "zero_inflated", "ensemble", "xg_dixon_coles"];
  const score = Object.fromEntries(names.map((n) => [n, { ll: 0, brier: 0, hits: 0, n: 0 }]));

  for (const r of rows) {
    const L = lg.get(r.league_code) ?? { n: 0, h: 0, a: 0, hw: 0, d: 0, aw: 0 };
    const hk = `${r.league_code}|${r.home_name}`, ak = `${r.league_code}|${r.away_name}`;
    if (r.home_team_id) ids.set(hk, r.home_team_id);
    if (r.away_team_id) ids.set(ak, r.away_team_id);
    const t = new Date(r.match_date).getTime();
    const eh = ew.get(hk), ea = ew.get(ak);
    const dh = dc.get(hk), da = dc.get(ak);
    const xh = dx.get(hk), xa = dx.get(ak);
    const rh = elo.get(hk) ?? 1500, ra = elo.get(ak) ?? 1500;

    if (t >= evalFrom && L.n >= 60 && eh && ea && eh.n >= 6 && ea.n >= 6 && dh && da && xh && xa) {
      const lh = L.h / L.n, la = L.a / L.n, all = (lh + la) / 2;
      const dcl = (() => {
        const hgf = dh.gf / dh.w, hga = dh.ga / dh.w, agf = da.gf / da.w, aga = da.ga / da.w;
        return [clamp(hgf / all * aga / all * lh, 0.2, 4.5), clamp(agf / all * hga / all * la, 0.2, 4.5)] as const;
      })();
      const preds: Record<ModelName, Probs> = {
        baseline: { home: L.hw / L.n, draw: L.d / L.n, away: L.aw / L.n, o25: 0.5, btts: 0.5 },
        poisson: goalProbs(clamp(eh.gf / all * ea.ga / all * lh, 0.2, 4.5), clamp(ea.gf / all * eh.ga / all * la, 0.2, 4.5)),
        dixon_coles: (() => {
          const hgf = dh.gf / dh.w, hga = dh.ga / dh.w, agf = da.gf / da.w, aga = da.ga / da.w;
          return goalProbs(clamp(hgf / all * aga / all * lh, 0.2, 4.5), clamp(agf / all * hga / all * la, 0.2, 4.5), -0.1);
        })(),
        elo: eloProbs(rh, ra, L.d / L.n),
        bivariate: bivariateProbs(dcl[0], dcl[1]),
        zero_inflated: zeroInflatedProbs(dcl[0], dcl[1]),
        ensemble: avgProbs(goalProbs(dcl[0], dcl[1], -0.1), eloProbs(rh, ra, L.d / L.n)),
        xg_dixon_coles: goalProbs(
          clamp(xh.gf / xh.w / all * (xa.ga / xa.w) / all * lh, 0.2, 4.5),
          clamp(xa.gf / xa.w / all * (xh.ga / xh.w) / all * la, 0.2, 4.5), -0.1),
      };
      const out = r.home_goals > r.away_goals ? "home" : r.home_goals === r.away_goals ? "draw" : "away";
      for (const n of names) {
        const p = preds[n];
        const s = score[n]!;
        s.ll += -Math.log(Math.max(1e-6, p[out]));
        s.brier += (["home", "draw", "away"] as const).reduce((a, k) => a + ((k === out ? 1 : 0) - p[k]) ** 2, 0);
        const top = (["home", "draw", "away"] as const).reduce((a, k) => (p[k] > p[a] ? k : a), "home" as "home" | "draw" | "away");
        if (top === out) s.hits += 1;
        s.n += 1;
      }
    }

    // ---- update state with the result ----
    L.n += 1; L.h += r.home_goals; L.a += r.away_goals;
    if (r.home_goals > r.away_goals) L.hw += 1; else if (r.home_goals === r.away_goals) L.d += 1; else L.aw += 1;
    lg.set(r.league_code, L);
    const A = 0.08;
    const upEw = (k: string, gf: number, ga: number) => {
      const e = ew.get(k);
      ew.set(k, e ? { gf: e.gf + A * (gf - e.gf), ga: e.ga + A * (ga - e.ga), n: e.n + 1 } : { gf, ga, n: 1 });
    };
    upEw(hk, r.home_goals, r.away_goals); upEw(ak, r.away_goals, r.home_goals);
    const upDc = (k: string, gf: number, ga: number) => {
      const e = dc.get(k);
      const f = e ? Math.exp(-XI * (t - e.last) / 86400e3) : 0;
      dc.set(k, { gf: (e?.gf ?? 0) * f + gf, ga: (e?.ga ?? 0) * f + ga, w: (e?.w ?? 0) * f + 1, last: t });
    };
    upDc(hk, r.home_goals, r.away_goals); upDc(ak, r.away_goals, r.home_goals);
    const hp = r.home_xg != null && r.away_xg != null ? (r.home_goals + Number(r.home_xg)) / 2 : r.home_goals;
    const ap = r.home_xg != null && r.away_xg != null ? (r.away_goals + Number(r.away_xg)) / 2 : r.away_goals;
    const upDx = (k: string, gf: number, ga: number) => {
      const e = dx.get(k);
      const f = e ? Math.exp(-XI * (t - e.last) / 86400e3) : 0;
      dx.set(k, { gf: (e?.gf ?? 0) * f + gf, ga: (e?.ga ?? 0) * f + ga, w: (e?.w ?? 0) * f + 1, last: t });
    };
    upDx(hk, hp, ap); upDx(ak, ap, hp);
    const we = 1 / (1 + Math.pow(10, -(rh - ra + 60) / 400));
    const res = r.home_goals > r.away_goals ? 1 : r.home_goals === r.away_goals ? 0.5 : 0;
    const gd = Math.abs(r.home_goals - r.away_goals);
    const k = 20 * (gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8);
    elo.set(hk, rh + k * (res - we)); elo.set(ak, ra - k * (res - we));
  }

  const results = names.map((n) => {
    const s = score[n]!;
    return { model: n, samples: s.n, logLoss: s.ll / s.n, brier: s.brier / s.n, accuracy: s.hits / s.n };
  }).sort((a, b) => a.logLoss - b.logLoss);
  const winner = results[0]!.model;

  // Current ratings for linked teams (latest league wins if a team moved).
  const ratings: Record<string, { league: string; lh: number; la: number; gf: number; ga: number; dgf: number; dga: number; xgf: number; xga: number; elo: number; drawRate: number }> = {};
  for (const [key, teamId] of ids) {
    const league = key.split("|")[0]!;
    const L = lg.get(league)!, e = ew.get(key), d = dc.get(key), x = dx.get(key);
    if (!e || !d || !x || e.n < 6) continue;
    ratings[teamId] = {
      league, lh: L.h / L.n, la: L.a / L.n, gf: e.gf, ga: e.ga, dgf: d.gf / d.w, dga: d.ga / d.w, xgf: x.gf / x.w, xga: x.ga / x.w,
      elo: elo.get(key) ?? 1500, drawRate: L.d / L.n,
    };
  }

  const { error } = await supabaseAdmin.from("model_competitions").insert({
    samples: results[0]!.samples, winner, results, ratings, triggered_by: opts.triggeredBy ?? "manual",
  });
  if (error) throw new Error(error.message);
  return { winner, results, linkedTeams: Object.keys(ratings).length };
}

type Rating = { lh: number; la: number; gf: number; ga: number; dgf: number; dga: number; xgf?: number; xga?: number; elo: number; drawRate: number };

/** Winner-model probabilities for a fixture, or null when either team lacks ratings. */
export function championProbs(winner: string, h: Rating | undefined, a: Rating | undefined): Probs | null {
  if (!h || !a) return null;
  const lh = (h.lh + a.lh) / 2, la = (h.la + a.la) / 2, all = (lh + la) / 2;
  if (winner === "elo") return eloProbs(h.elo, a.elo, (h.drawRate + a.drawRate) / 2);
  if (winner === "dixon_coles") return goalProbs(clamp(h.dgf / all * a.dga / all * lh, 0.2, 4.5), clamp(a.dgf / all * h.dga / all * la, 0.2, 4.5), -0.1);
  const dh = clamp(h.dgf / all * a.dga / all * lh, 0.2, 4.5), da = clamp(a.dgf / all * h.dga / all * la, 0.2, 4.5);
  if (winner === "bivariate") return bivariateProbs(dh, da);
  if (winner === "zero_inflated") return zeroInflatedProbs(dh, da);
  if (winner === "ensemble") {
    const e = eloProbs(h.elo, a.elo, (h.drawRate + a.drawRate) / 2);
    const g = goalProbs(dh, da, -0.1);
    // Elo has no goal view: keep goal markets from the goal model only.
    return { ...avgProbs(g, e), o25: g.o25, btts: g.btts };
  }
  if (winner === "xg_dixon_coles") {
    if (h.xgf == null || h.xga == null || a.xgf == null || a.xga == null) return null;
    return goalProbs(clamp(h.xgf / all * a.xga / all * lh, 0.2, 4.5), clamp(a.xgf / all * h.xga / all * la, 0.2, 4.5), -0.1);
  }
  if (winner === "poisson") return goalProbs(clamp(h.gf / all * a.ga / all * lh, 0.2, 4.5), clamp(a.gf / all * h.ga / all * la, 0.2, 4.5));
  return null;
}
