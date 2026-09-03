const key = process.env["API_FOOTBALL_KEY"]!;
const r = await fetch("https://v3.football.api-sports.io/status", { headers: { "x-apisports-key": key } });
console.log(JSON.stringify(await r.json()));
