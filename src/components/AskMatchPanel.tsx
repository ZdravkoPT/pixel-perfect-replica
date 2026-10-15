import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAboutMatch, type AskTurn } from "@/lib/ask-match.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AskMatchPanel({ matchId }: { matchId: string }) {
  const ask = useServerFn(askAboutMatch);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const text = q.trim();
    if (!text || busy) return;
    const history: AskTurn[] = [...turns, { role: "user", content: text }];
    setTurns(history); setQ(""); setBusy(true);
    try {
      const r = await ask({ data: { matchId, history } });
      setTurns([...history, { role: "assistant", content: r.answer }]);
    } catch {
      setTurns([...history, { role: "assistant", content: "Something went wrong — try again." }]);
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Answers come only from the data we store for this match. If something isn't there, the AI says so. It never changes the pick.</p>
      <div className="space-y-2">
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[90%] text-sm whitespace-pre-wrap"}>{t.content}</div>
        ))}
        {busy && <p className="text-xs text-muted-foreground">Thinking…</p>}
      </div>
      <div className="flex gap-2">
        <Textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Why does the AI favour the home side?" rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <Button onClick={() => void send()} disabled={busy || !q.trim()}>Ask</Button>
      </div>
    </div>
  );
}
