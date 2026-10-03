import { useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { listFavorites } from "@/lib/favorites.functions";
import { listLiveMatches } from "@/lib/live.functions";
import { useAuth } from "@/hooks/useAuth";

const KEY = "goal-alerts-on";

/** Browser notifications for goals, kickoffs and full time in games of followed teams. */
export function GoalAlerts() {
  const { user } = useAuth();
  const [on, setOn] = useState(false);
  const last = useRef(new Map<string, string>());
  useEffect(() => { setOn(localStorage.getItem(KEY) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted"); }, []);

  useEffect(() => {
    if (!on || !user) return;
    let stop = false;
    const tick = async () => {
      try {
        const [{ favorites }, live] = await Promise.all([listFavorites(), listLiveMatches()]);
        const teams = new Set(favorites.filter((f) => f.entity_type === "team").map((f) => f.entity_id));
        for (const m of [...live.live, ...live.finished] as unknown as Array<{ id: string; status: string; home_score: number | null; away_score: number | null; home: { id: string; name: string } | null; away: { id: string; name: string } | null }>) {
          if (!teams.has(m.home?.id ?? "") && !teams.has(m.away?.id ?? "")) continue;
          const state = `${m.status}|${m.home_score ?? "-"}-${m.away_score ?? "-"}`;
          const prev = last.current.get(m.id);
          last.current.set(m.id, state);
          if (prev === undefined || prev === state || stop) continue;
          const score = `${m.home?.name} ${m.home_score ?? 0}–${m.away_score ?? 0} ${m.away?.name}`;
          const title = m.status === "FINISHED" ? "Full time" : prev.split("|")[1] !== state.split("|")[1] ? "Goal!" : "Match update";
          new Notification(title, { body: score, tag: m.id });
        }
      } catch { /* try again next tick */ }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [on, user]);

  if (!user || typeof window === "undefined") return null;
  const toggle = async () => {
    if (on) { localStorage.setItem(KEY, "0"); setOn(false); return; }
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    if (p === "granted") { localStorage.setItem(KEY, "1"); setOn(true); }
  };
  return (
    <button onClick={toggle} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
      {on ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
      {on ? "Goal alerts on" : "Goal alerts for followed teams"}
    </button>
  );
}
