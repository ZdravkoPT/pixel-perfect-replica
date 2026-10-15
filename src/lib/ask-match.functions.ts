import { createServerFn } from "@tanstack/react-start";
import { gatherEvidence } from "./analysts.functions";

/** Answers questions about one match strictly from stored data. Never changes probabilities. */
export type AskTurn = { role: "user" | "assistant"; content: string };

const SYSTEM = `You answer questions about one football match using ONLY the JSON data provided. Never invent numbers, players, injuries, odds or facts.
If the answer is not in the data, say plainly: "That is not in our data." The app uses no bookmaker odds by design.
You cannot change the AI's probabilities or pick. Keep answers short (2-5 sentences), plain language, reply in the user's language.`;

export const askAboutMatch = createServerFn({ method: "POST" })
  .inputValidator((d: { matchId: string; history: AskTurn[] }) => {
    const history = (d.history ?? []).slice(-10).map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", content: String(t.content).slice(0, 1000) })) as AskTurn[];
    if (!history.length || history[history.length - 1]!.role !== "user") throw new Error("Ask a question first.");
    return { matchId: String(d.matchId), history };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; answer: string }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, answer: "AI is not configured." };
    const evidence = await gatherEvidence(data.matchId);
    if (!evidence) return { ok: false, answer: "Match not found." };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra", reasoning_effort: "low",
        messages: [{ role: "system", content: SYSTEM }, { role: "system", content: `Match data: ${JSON.stringify(evidence)}` }, ...data.history],
      }),
    });
    if (!res.ok) {
      console.error("ask-match AI", res.status, (await res.text()).slice(0, 200));
      return { ok: false, answer: res.status === 402 ? "AI credits have run out — questions will work again once credits are added."
        : res.status === 429 ? "AI is busy right now — try again in a minute." : "The AI could not be reached right now." };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const answer = json.choices?.[0]?.message?.content?.trim();
    return answer ? { ok: true, answer } : { ok: false, answer: "No answer came back — try asking differently." };
  });
