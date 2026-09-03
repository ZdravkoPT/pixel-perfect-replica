import { ingestSquads, runIntel } from "./src/lib/intel.server";
console.log("squads", JSON.stringify(await ingestSquads({ triggeredBy: "manual" })));
console.log("intel", JSON.stringify(await runIntel({ triggeredBy: "manual" })));
