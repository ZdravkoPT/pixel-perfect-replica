import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import { toast } from "sonner";

type P = { fixture: string; league: string | null; kickoffAt: string; market: string; selection: string; probability: number; confidence: string; reasons: string[] };

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    if (ctx.measureText(line + w).width > max && line) { ctx.fillText(line, x, y); y += lh; line = ""; }
    line += w + " ";
  }
  ctx.fillText(line, x, y);
  return y + lh;
}

/** Draws the pick on a canvas (colours read from the theme) and shares or downloads it. */
export function PickShare({ pick, top }: { pick: P; top: string[] }) {
  const onShare = async () => {
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1080;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = v("--background") || "black"; ctx.fillRect(0, 0, 1080, 1080);
    ctx.fillStyle = v("--primary") || "gray"; ctx.fillRect(0, 0, 1080, 12);
    const fg = v("--foreground") || "white", mute = v("--muted-foreground") || "gray";
    ctx.fillStyle = mute; ctx.font = "32px sans-serif";
    ctx.fillText(`${pick.league ?? ""} · ${new Date(pick.kickoffAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`, 80, 120);
    ctx.fillStyle = fg; ctx.font = "bold 60px sans-serif";
    let y = wrap(ctx, pick.fixture, 80, 210, 920, 72);
    ctx.font = "bold 52px sans-serif"; ctx.fillStyle = v("--primary") || fg;
    y = wrap(ctx, `${pick.market}: ${pick.selection}`, 80, y + 40, 920, 64);
    ctx.font = "bold 120px sans-serif"; ctx.fillStyle = fg;
    ctx.fillText(`${Math.round(pick.probability * 100)}%`, 80, y + 110);
    ctx.font = "36px sans-serif"; ctx.fillStyle = mute;
    ctx.fillText(`${pick.confidence} confidence`, 420, y + 100);
    y += 190;
    ctx.font = "30px sans-serif"; ctx.fillStyle = fg;
    for (const r of top) y = wrap(ctx, `• ${r}`, 80, y, 920, 40) + 10;
    ctx.fillStyle = mute; ctx.font = "26px sans-serif";
    ctx.fillText("AI probability, not a guarantee · 18+ · bet responsibly", 80, 1030);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    if (!blob) return;
    const file = new File([blob], "ai-pick.png", { type: "image/png" });
    const text = `${pick.fixture} — ${pick.market}: ${pick.selection} (${Math.round(pick.probability * 100)}%)`;
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    } catch { return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "ai-pick.png"; a.click();
    toast.success("Pick image downloaded");
  };
  return (
    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onShare}>
      <Share2 className="mr-1 h-3 w-3" /> Share
    </Button>
  );
}
