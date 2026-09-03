const key = process.env["FOOTBALL_DATA_ORG_KEY"]!;
async function g(p: string) {
  const r = await fetch("https://api.football-data.org/v4" + p, { headers: { "X-Auth-Token": key } });
  const t = await r.text();
  console.log(p, r.status, t.slice(0, 400).replace(/\s+/g," "));
  return t;
}
await g("/competitions/PL/teams");
await g("/matches?dateFrom=2026-08-01&dateTo=2026-08-31&competitions=PL");
