import { createServerFn } from "@tanstack/react-start";
import { publicClient } from "./leagues.functions";

export type CheckItem = { label: string; value: string; tone: "good" | "warn" | "neutral" | "unknown" };

/** One-glance pre-kickoff checklist from stored data only; unknown items say so. */
export const getPrematchChecklist = createServerFn({ method: "GET" })
  .inputValidator((d: { matchId: string }) => d)
  .handler(async ({ data }) => buildChecklist(data.matchId));

export async function buildChecklist(matchId: string): Promise<CheckItem[]> {
    const data = { matchId };
    const sb = publicClient();
    const { data: m } = await sb.from("matches").select("id, kickoff_at, home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)").eq("id", data.matchId).maybeSingle();
    if (!m) return [] as CheckItem[];
    const hn = (m.home as { name: string } | null)?.name ?? "Home", an = (m.away as { name: string } | null)?.name ?? "Away";
    const teams = [m.home_team_id, m.away_team_id];
    const [lu, inj, off, ctx, prev, cache] = await Promise.all([
      sb.from("lineups").select("team_id, is_predicted").eq("match_id", m.id),
      sb.from("injuries").select("team_id").in("team_id", teams).is("resolved_at", null),
      sb.from("match_officials").select("referee:referees(id, name)").eq("match_id", m.id).eq("role", "referee").maybeSingle(),
      sb.from("match_context").select("temp_c, precip_mm, wind_kmh, away_travel_km").eq("match_id", m.id).maybeSingle(),
      sb.from("matches").select("kickoff_at, home_team_id, away_team_id").or(`home_team_id.in.(${teams.join(",")}),away_team_id.in.(${teams.join(",")})`)
        .lt("kickoff_at", m.kickoff_at).order("kickoff_at", { ascending: false }).limit(20),
      sb.from("match_picks_cache").select("payload").eq("id", "latest").maybeSingle(),
    ]);
    const items: CheckItem[] = [];
    const lus = lu.data ?? [];
    const confirmed = lus.filter((l) => !l.is_predicted).length;
    items.push(confirmed === 2 ? { label: "Line-ups", value: "Both confirmed", tone: "good" }
      : lus.length ? { label: "Line-ups", value: confirmed ? "One side confirmed" : "Predicted only", tone: "warn" }
      : { label: "Line-ups", value: "Not available yet", tone: "unknown" });
    const injN = (t: string) => (inj.data ?? []).filter((i) => i.team_id === t).length;
    const ih = injN(m.home_team_id), ia = injN(m.away_team_id);
    items.push({ label: "Players out", value: `${hn} ${ih} · ${an} ${ia}`, tone: ih + ia >= 4 ? "warn" : "neutral" });
    const ref = off.data?.referee as { id: string; name: string } | null | undefined;
    if (ref) {
      const { data: o2 } = await sb.from("match_officials").select("match_id").eq("referee_id", ref.id).eq("role", "referee");
      const { data: st } = await sb.from("team_match_stats").select("match_id, yellow_cards").in("match_id", (o2 ?? []).map((x) => x.match_id));
      const per = new Map<string, number>();
      for (const s of st ?? []) if (s.yellow_cards != null) per.set(s.match_id, (per.get(s.match_id) ?? 0) + s.yellow_cards);
      const v = [...per.values()];
      items.push({ label: "Referee", value: v.length >= 3 ? `${ref.name} · ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)} yellows/game (${v.length} games)` : `${ref.name} · too few games for a card rate`, tone: "neutral" });
    } else items.push({ label: "Referee", value: "Not announced", tone: "unknown" });
    const c = ctx.data;
    if (c && (c.precip_mm != null || c.wind_kmh != null)) {
      const bad = Number(c.precip_mm ?? 0) >= 2 || Number(c.wind_kmh ?? 0) >= 30;
      items.push({ label: "Weather", value: `${c.temp_c != null ? `${Math.round(Number(c.temp_c))}°C · ` : ""}${Number(c.precip_mm ?? 0).toFixed(1)} mm rain · wind ${Math.round(Number(c.wind_kmh ?? 0))} km/h`, tone: bad ? "warn" : "good" });
    } else items.push({ label: "Weather", value: "No forecast yet", tone: "unknown" });
    if (c?.away_travel_km != null) items.push({ label: "Away travel", value: `${Math.round(Number(c.away_travel_km)).toLocaleString("en")} km`, tone: Number(c.away_travel_km) >= 1500 ? "warn" : "neutral" });
    const rest = (t: string) => {
      const p = (prev.data ?? []).find((x) => x.home_team_id === t || x.away_team_id === t);
      return p ? Math.round((new Date(m.kickoff_at).getTime() - new Date(p.kickoff_at).getTime()) / 86400e3) : null;
    };
    const rh = rest(m.home_team_id), ra = rest(m.away_team_id);
    items.push({ label: "Rest days", value: `${hn} ${rh ?? "?"} · ${an} ${ra ?? "?"}`, tone: (rh != null && rh < 3) || (ra != null && ra < 3) ? "warn" : rh == null || ra == null ? "unknown" : "neutral" });
    const payload = cache.data?.payload as { picks?: Array<{ matchId: string; selection: string; probability: number; reasons?: string[] }>; noBets?: Array<{ matchId: string; noBetReason?: string; reason?: string }> } | undefined;
    const pick = payload?.picks?.find((p) => p.matchId === m.id);
    const nb = payload?.noBets?.find((p) => p.matchId === m.id);
    const stake = pick?.reasons?.find((r) => r.startsWith("What's at stake") || r.startsWith("Another competition"));
    if (stake) items.push({ label: "Motivation", value: stake.replace(/^[^:]+:\s*/, ""), tone: "warn" });
    items.push(pick ? { label: "AI verdict", value: `${pick.selection} · ${Math.round(pick.probability * 100)}%`, tone: "good" }
      : nb ? { label: "AI verdict", value: `No bet — ${nb.noBetReason ?? nb.reason ?? "no market clears the bar"}`, tone: "neutral" }
      : { label: "AI verdict", value: "Not scored yet", tone: "unknown" });
    return items;
  });
