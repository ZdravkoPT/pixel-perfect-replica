/**
 * Stadium location (FotMob) + kickoff weather forecast (Open-Meteo, free, no key)
 * + away-side travel distance. Missing data stays null — never guessed.
 */
const FOTMOB = "https://www.fotmob.com/api/data";
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36", Accept: "application/json" };

function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function stadium(providerId: string) {
  try {
    const res = await fetch(`${FOTMOB}/matchDetails?matchId=${providerId}`, { headers: UA });
    if (!res.ok) return null;
    const d = (await res.json()) as { content?: { matchFacts?: { infoBox?: { Stadium?: Record<string, unknown> } } } };
    const s = d.content?.matchFacts?.infoBox?.Stadium;
    if (!s || typeof s.lat !== "number" || typeof s.long !== "number") return null;
    return { name: String(s.name ?? ""), city: s.city ? String(s.city) : null, country: s.country ? String(s.country) : null, lat: s.lat, lon: s.long };
  } catch {
    return null;
  }
}

async function weather(lat: number, lon: number, kickoff: string) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m&timezone=UTC&forecast_days=3`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = (await res.json()) as { hourly?: { time: string[]; temperature_2m: number[]; precipitation: number[]; wind_speed_10m: number[] } };
    const h = d.hourly;
    if (!h) return null;
    const target = kickoff.slice(0, 13);
    const i = h.time.findIndex((t) => t.slice(0, 13) === target);
    if (i < 0) return null;
    // rain over kickoff + following hour
    const rain = (h.precipitation[i] ?? 0) + (h.precipitation[i + 1] ?? 0);
    return { temp: h.temperature_2m[i], rain, wind: h.wind_speed_10m[i] };
  } catch {
    return null;
  }
}

export async function refreshMatchContext(opts: { budgetMs?: number; pastLimit?: number } = {}) {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 90_000;
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const now = Date.now();
  const { data: upcoming } = await sb.from("matches")
    .select("id, kickoff_at, home_team_id, away_team_id, src:match_sources!inner(provider_match_id, source_id)")
    .eq("status", "SCHEDULED").eq("src.source_id", "fotmob")
    .gte("kickoff_at", new Date(now).toISOString()).lte("kickoff_at", new Date(now + 60 * 3600e3).toISOString())
    .limit(120);
  // recent finished home games with no venue yet → builds each club's home base for travel
  const { data: past } = await sb.from("matches")
    .select("id, kickoff_at, home_team_id, away_team_id, src:match_sources!inner(provider_match_id, source_id), ctx:match_context(match_id)")
    .eq("status", "FINISHED").eq("src.source_id", "fotmob")
    .gte("kickoff_at", new Date(now - 120 * 86400e3).toISOString())
    .order("kickoff_at", { ascending: false }).limit(400);

  type Row = { id: string; kickoff_at: string; home_team_id: string; away_team_id: string; src: Array<{ provider_match_id: string }> | { provider_match_id: string } };
  const pid = (r: Row) => (Array.isArray(r.src) ? r.src[0]?.provider_match_id : r.src?.provider_match_id);
  let venues = 0, forecasts = 0, travel = 0;

  // 1) past venues (only missing), limited
  const pastTodo = ((past ?? []) as Array<Row & { ctx: unknown }>).filter((r) => !r.ctx || (Array.isArray(r.ctx) && !r.ctx.length)).slice(0, opts.pastLimit ?? 60);
  for (const r of pastTodo) {
    if (Date.now() - t0 > budget * 0.4) break;
    const p = pid(r); if (!p) continue;
    const s = await stadium(p); if (!s) continue;
    await sb.from("match_context").upsert({ match_id: r.id, venue_name: s.name, city: s.city, country: s.country, lat: s.lat, lon: s.lon, fetched_at: new Date().toISOString() });
    venues++;
  }

  // home base per team = venue of its most recent home game with a location
  const { data: bases } = await sb.from("match_context").select("lat, lon, m:matches!inner(home_team_id, kickoff_at, status)")
    .eq("m.status", "FINISHED").not("lat", "is", null).order("fetched_at", { ascending: false }).limit(3000);
  const baseBy = new Map<string, { lat: number; lon: number; at: string }>();
  for (const b of (bases ?? []) as unknown as Array<{ lat: number; lon: number; m: { home_team_id: string; kickoff_at: string } }>) {
    const cur = baseBy.get(b.m.home_team_id);
    if (!cur || b.m.kickoff_at > cur.at) baseBy.set(b.m.home_team_id, { lat: Number(b.lat), lon: Number(b.lon), at: b.m.kickoff_at });
  }

  // 2) upcoming: venue + forecast + travel
  for (const r of (upcoming ?? []) as Row[]) {
    if (Date.now() - t0 > budget) break;
    const p = pid(r); if (!p) continue;
    const s = await stadium(p); if (!s) continue;
    venues++;
    const w = await weather(s.lat, s.lon, r.kickoff_at);
    if (w) forecasts++;
    const base = baseBy.get(r.away_team_id);
    const tr = base ? Math.round(km(base.lat, base.lon, s.lat, s.lon)) : null;
    if (tr !== null) travel++;
    await sb.from("match_context").upsert({
      match_id: r.id, venue_name: s.name, city: s.city, country: s.country, lat: s.lat, lon: s.lon,
      temp_c: w?.temp ?? null, precip_mm: w?.rain ?? null, wind_kmh: w?.wind ?? null,
      weather_at: w ? new Date().toISOString() : null, away_travel_km: tr, fetched_at: new Date().toISOString(),
    });
  }
  return { venues, forecasts, travel, ms: Date.now() - t0 };
}
