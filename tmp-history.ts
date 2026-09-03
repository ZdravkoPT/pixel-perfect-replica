import { ingestHistory } from "./src/lib/ingest.server";
const r = await ingestHistory({ seasons: [2024, 2025], triggeredBy: "bootstrap" });
console.log("RESULT " + JSON.stringify(r));
