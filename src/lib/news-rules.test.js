import { expect, test } from "vitest";
import { extractRuleFacts } from "./news-rules";
test("injury official", () => { const f = extractRuleFacts("The club confirmed Saka is ruled out for six weeks with a hamstring problem. Nice weather today in London town."); expect(f).toHaveLength(1); expect(f[0].category).toBe("injury"); expect(f[0].status).toBe("official"); expect(f[0].importance).toBe(5); });
test("suspension rumour", () => { const f = extractRuleFacts("Rice could be suspended after another yellow card this weekend."); expect(f[0].category).toBe("suspension"); expect(f[0].status).toBe("rumour"); });
