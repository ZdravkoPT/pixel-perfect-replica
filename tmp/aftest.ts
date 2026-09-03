const key = process.env["API_FOOTBALL_KEY"]!;
async function g(p: string) {
  const r = await fetch("https://v3.football.api-sports.io" + p, { headers: { "x-apisports-key": key } });
  const j: any = await r.json();
  console.log(p, "results=", j.results, "errors=", JSON.stringify(j.errors).slice(0,200));
  return j;
}
await g("/players/squads?team=33");
await g("/injuries?league=39&season=2026");
const f: any = await g("/fixtures?league=39&season=2026&next=3");
console.log(JSON.stringify(f.response?.[0]?.fixture?.id));
