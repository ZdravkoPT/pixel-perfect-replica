import { runBacktest } from "@/lib/analytics.server";
console.log(JSON.stringify(await runBacktest({ triggeredBy: "manual" }), null, 2));
