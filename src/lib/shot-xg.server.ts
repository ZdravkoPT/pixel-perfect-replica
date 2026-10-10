/**
 * Our own shot xG model: logistic regression on distance, angle, header,
 * penalty, set piece and fast break, fitted on every stored FotMob shot,
 * optionally plus free StatsBomb open-data shots (training only — the test
 * set is always our own held-out matches). Coefficients live in
 * model_versions (kind "shot_xg"); FotMob's own xG is kept as a benchmark.
 */
export type ShotIn = { x: number; y: number; situation: string | null; shot_type: string | null };
export type ShotModel = { w: number[]; mu: number[]; sd: number[] };

// FotMob pitch: x 0–105 toward goal, y 0–68, goal centre (105, 34), posts ±3.66
export function features(s: ShotIn): number[] {
  const dx = Math.max(105 - s.x, 0.5), dy = s.y - 34;
  const dist = Math.hypot(dx, dy);
  const angle = Math.abs(Math.atan2(7.32 * dx, dx * dx + dy * dy - 3.66 * 3.66));
  const sit = (s.situation ?? "").toLowerCase(), typ = (s.shot_type ?? "").toLowerCase();
  return [dist, Math.log(dist), angle, typ.includes("head") ? 1 : 0, sit.includes("penalty") ? 1 : 0,
    /corner|setpiece|freekick|throw/.test(sit) ? 1 : 0, sit.includes("fastbreak") ? 1 : 0];
}
const sig = (z: number) => 1 / (1 + Math.exp(-z));

export function scoreShot(m: ShotModel, s: ShotIn): number {
  const f = features(s).map((v, i) => (v - m.mu[i]!) / (m.sd[i] || 1));
  return sig(m.w[0]! + f.reduce((a, v, i) => a + v * m.w[i + 1]!, 0));
}

export async function loadShotModel(db: any): Promise<ShotModel | null> {
  const { data } = await db.from("model_versions").select("params").eq("kind", "shot_xg").eq("is_active", true).order("version", { ascending: false }).limit(1).maybeSingle();
  return (data?.params as ShotModel) ?? null;
}

function fit(X: number[][], y: number[]): ShotModel {
  const k = X[0]!.length;
  const mu = Array.from({ length: k }, (_, i) => X.reduce((a, f) => a + f[i]!, 0) / X.length);
  const sd = Array.from({ length: k }, (_, i) => Math.sqrt(X.reduce((a, f) => a + (f[i]! - mu[i]!) ** 2, 0) / X.length) || 1);
  const Z = X.map((f) => f.map((v, i) => (v - mu[i]!) / sd[i]!));
  const w = new Array(k + 1).fill(0);
  for (let it = 0; it < 600; it++) {
    const g = new Array(k + 1).fill(0);
    for (let i = 0; i < Z.length; i++) {
      const e = sig(w[0] + Z[i]!.reduce((a, v, j) => a + v * w[j + 1], 0)) - y[i]!;
      g[0] += e; Z[i]!.forEach((v, j) => (g[j + 1] += e * v));
    }
    for (let j = 0; j <= k; j++) w[j] -= (0.5 * g[j]) / Z.length + (j ? 0.001 * w[j] : 0);
  }
  return { w, mu, sd };
}

export async function trainShotModel(opts: { statsbomb?: boolean } = {}) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("match_shots").select("id, match_id, x, y, situation, shot_type, is_goal, provider_xg").range(from, from + 999);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  if (rows.length < 500) return { ok: false, reason: `only ${rows.length} shots stored` };
  // hold out every 5th match for an honest test
  const test = (r: any) => parseInt(String(r.match_id).slice(-2), 16) % 5 === 0;
  const trainRows = rows.filter((r) => !test(r));
  const testRows = rows.filter(test);
  const ll = (p: number, t: number) => -(t * Math.log(Math.max(p, 1e-6)) + (1 - t) * Math.log(Math.max(1 - p, 1e-6)));
  const evalLL = (m: ShotModel) => testRows.reduce((a, r) => a + ll(scoreShot(m, r), r.is_goal ? 1 : 0), 0) / testRows.length;

  const own = fit(trainRows.map((r) => features(r)), trainRows.map((r) => (r.is_goal ? 1 : 0)));
  let model = own, source = "own", extraShots = 0, ownLL = evalLL(own), withSbLL: number | null = null;
  if (opts.statsbomb !== false) {
    const { fetchStatsbombShots } = await import("./statsbomb.server");
    const sb = await fetchStatsbombShots({ maxMatches: 60, budgetMs: 60_000 }).catch(() => []);
    if (sb.length >= 300) {
      const all = [...trainRows, ...sb];
      const mixed = fit(all.map((r) => features(r)), all.map((r) => (r.is_goal ? 1 : 0)));
      withSbLL = evalLL(mixed);
      extraShots = sb.length;
      if (withSbLL < ownLL) { model = mixed; source = "own+statsbomb"; }
    }
  }

  let goals = 0, sumOurs = 0, theirs = 0, nb = 0;
  for (const r of testRows) {
    goals += r.is_goal ? 1 : 0; sumOurs += scoreShot(model, r);
    if (r.provider_xg != null) { theirs += ll(Number(r.provider_xg), r.is_goal ? 1 : 0); nb++; }
  }
  const metrics = {
    shots: rows.length, test_shots: testRows.length, log_loss: Math.min(ownLL, withSbLL ?? Infinity),
    own_only_log_loss: ownLL, with_statsbomb_log_loss: withSbLL, statsbomb_shots: extraShots, training_source: source,
    fotmob_log_loss: nb ? theirs / nb : null, test_goals: goals, test_xg: sumOurs,
  };
  const { data: prev } = await db.from("model_versions").select("version").eq("kind", "shot_xg").order("version", { ascending: false }).limit(1).maybeSingle();
  await db.from("model_versions").update({ is_active: false }).eq("kind", "shot_xg");
  await db.from("model_versions").insert({ name: `Own shot xG (logistic, ${source})`, kind: "shot_xg", version: (prev?.version ?? 0) + 1, params: model as never, metrics: metrics as never, training_samples: trainRows.length + (source === "own" ? 0 : extraShots), is_active: true });
  for (let i = 0; i < rows.length; i += 50) {
    await Promise.all(rows.slice(i, i + 50).map((r) => db.from("match_shots").update({ model_xg: scoreShot(model, r) }).eq("id", r.id)));
  }
  return { ok: true, ...metrics };
}
