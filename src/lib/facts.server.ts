import type { MatchFacts } from "./providers/fotmob.server";

type MatchRow = {
  id: string;
  kickoff_at: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
};

/**
 * Match facts built from our own archive so every fixture has a facts panel even
 * when no external feed publishes one: recent form, scoring profile, officials,
 * venue, the model's goal rates and the archived head-to-head record.
 */
export async function buildLocalFacts(matchId: string): Promise<MatchFacts | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: match } = await supabaseAdmin
    .from("matches")
    .select(
      "id, kickoff_at, status, matchday, home_team_id, away_team_id, home_score, away_score, league:leagues(name, country), venue:venues(name, city, capacity), home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)",
    )
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return null;

  const homeId = match.home_team_id;
  const awayId = match.away_team_id;
  const league = (match as unknown as { league: { name: string; country: string | null } | null })
    .league;
  const venue = (match as unknown as {
    venue: { name: string; city: string | null; capacity: number | null } | null;
  }).venue;
  const homeName =
    (match as unknown as { home: { name: string } | null }).home?.name ?? "Home";
  const awayName =
    (match as unknown as { away: { name: string } | null }).away?.name ?? "Away";

  const [{ data: officials }, { data: prediction }, { data: history }] = await Promise.all([
    supabaseAdmin
      .from("match_officials")
      .select("role, referee:referees(name, country)")
      .eq("match_id", matchId),
    supabaseAdmin
      .from("predictions")
      .select("lambda_home, lambda_away, expected_goals, p_home, p_draw, p_away, p_over_25, p_btts, top_scoreline")
      .eq("match_id", matchId)
      .order("prediction_timestamp", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("matches")
      .select("id, kickoff_at, status, home_team_id, away_team_id, home_score, away_score")
      .in("status", ["FINISHED"])
      .or(
        `home_team_id.in.(${homeId},${awayId}),away_team_id.in.(${homeId},${awayId})`,
      )
      .lt("kickoff_at", match.kickoff_at)
      .order("kickoff_at", { ascending: false })
      .limit(200),
  ]);

  const finished = ((history ?? []) as MatchRow[]).filter(
    (row) => row.home_score !== null && row.away_score !== null,
  );

  const profile = (teamId: string) => {
    const rows = finished
      .filter((row) => row.home_team_id === teamId || row.away_team_id === teamId)
      .slice(0, 10);
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let scored = 0;
    let conceded = 0;
    let over25 = 0;
    let btts = 0;
    let cleanSheets = 0;
    const form: string[] = [];
    for (const row of rows) {
      const isHome = row.home_team_id === teamId;
      const gf = (isHome ? row.home_score : row.away_score) ?? 0;
      const ga = (isHome ? row.away_score : row.home_score) ?? 0;
      scored += gf;
      conceded += ga;
      if (gf + ga > 2.5) over25 += 1;
      if (gf > 0 && ga > 0) btts += 1;
      if (ga === 0) cleanSheets += 1;
      if (gf > ga) {
        wins += 1;
        form.push("W");
      } else if (gf === ga) {
        draws += 1;
        form.push("D");
      } else {
        losses += 1;
        form.push("L");
      }
    }
    const played = rows.length || 1;
    return {
      played: rows.length,
      record: `${wins}W ${draws}D ${losses}L`,
      goalsFor: (scored / played).toFixed(2),
      goalsAgainst: (conceded / played).toFixed(2),
      over25: `${Math.round((over25 / played) * 100)}%`,
      btts: `${Math.round((btts / played) * 100)}%`,
      cleanSheets: `${cleanSheets}`,
      points: `${wins * 3 + draws}`,
      form: form.slice(0, 5),
    };
  };

  const home = profile(homeId);
  const away = profile(awayId);

  const info: Array<{ label: string; value: string }> = [];
  if (league) info.push({ label: "Competition", value: `${league.name}${league.country ? ` · ${league.country}` : ""}` });
  info.push({ label: "Kick-off", value: new Date(match.kickoff_at).toUTCString() });
  if (venue)
    info.push({
      label: "Stadium",
      value: `${venue.name}${venue.city ? `, ${venue.city}` : ""}${venue.capacity ? ` · ${venue.capacity.toLocaleString()} seats` : ""}`,
    });
  const referee = (officials ?? []).find((row) => row.role === "REFEREE" || row.role === "referee");
  const refereeName = (referee as unknown as { referee: { name: string } | null } | undefined)
    ?.referee?.name;
  if (refereeName) info.push({ label: "Referee", value: refereeName });
  if (match.matchday) info.push({ label: "Matchday", value: `${match.matchday}` });
  if (prediction) {
    info.push({
      label: "Model goal rates",
      value: `${Number(prediction.lambda_home).toFixed(2)} – ${Number(prediction.lambda_away).toFixed(2)} (${Number(prediction.expected_goals).toFixed(2)} total)`,
    });
    info.push({
      label: "Model 1X2",
      value: `${(Number(prediction.p_home) * 100).toFixed(0)}% / ${(Number(prediction.p_draw) * 100).toFixed(0)}% / ${(Number(prediction.p_away) * 100).toFixed(0)}%`,
    });
    if (prediction.top_scoreline)
      info.push({ label: "Most likely score", value: prediction.top_scoreline });
    if (prediction.p_over_25 !== null)
      info.push({
        label: "Over 2.5 / both score",
        value: `${(Number(prediction.p_over_25) * 100).toFixed(0)}% · ${prediction.p_btts === null ? "—" : `${(Number(prediction.p_btts) * 100).toFixed(0)}%`}`,
      });
  }

  const statGroups: MatchFacts["statGroups"] = [
    {
      title: "Last 10 matches",
      items: [
        { title: "Matches counted", home: `${home.played}`, away: `${away.played}` },
        { title: "Record", home: home.record, away: away.record },
        { title: "Points won", home: home.points, away: away.points },
        { title: "Goals scored per game", home: home.goalsFor, away: away.goalsFor },
        { title: "Goals conceded per game", home: home.goalsAgainst, away: away.goalsAgainst },
        { title: "Over 2.5 goals", home: home.over25, away: away.over25 },
        { title: "Both teams scored", home: home.btts, away: away.btts },
        { title: "Clean sheets", home: home.cleanSheets, away: away.cleanSheets },
      ],
    },
  ];

  const h2h = finished
    .filter(
      (row) =>
        (row.home_team_id === homeId && row.away_team_id === awayId) ||
        (row.home_team_id === awayId && row.away_team_id === homeId),
    )
    .slice(0, 8)
    .map((row) => ({
      date: row.kickoff_at,
      home: row.home_team_id === homeId ? homeName : awayName,
      away: row.home_team_id === homeId ? awayName : homeName,
      score: `${row.home_score} – ${row.away_score}`,
      league: league?.name ?? "",
    }));

  return {
    info,
    statGroups,
    events: [],
    form: [home.form, away.form],
    h2h,
  };
}
