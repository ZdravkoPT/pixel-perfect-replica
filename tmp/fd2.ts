const key = process.env["FOOTBALL_DATA_ORG_KEY"]!;
async function g(p: string) {
  const r = await fetch("https://api.football-data.org/v4" + p, { headers: { "X-Auth-Token": key } });
  return { s: r.status, t: await r.text() };
}
const m = await g("/matches?dateFrom=2026-08-22&dateTo=2026-08-25&competitions=PL");
const j: any = JSON.parse(m.t);
console.log(m.s, j.matches?.length, JSON.stringify(j.matches?.[0]?.referees), JSON.stringify(j.matches?.[0]?.id));
const d = await g(`/matches/${j.matches?.[0]?.id}`);
const dj: any = JSON.parse(d.t);
console.log(d.s, JSON.stringify(dj.referees), Object.keys(dj||{}).join(","), JSON.stringify(dj.homeTeam?.lineup?.length), JSON.stringify(dj.statistics)?.slice(0,300));
const t = await g("/teams/57");
const tj: any = JSON.parse(t.t);
console.log("team", t.s, tj.coach?.name, tj.squad?.length, JSON.stringify(tj.squad?.[0]));
