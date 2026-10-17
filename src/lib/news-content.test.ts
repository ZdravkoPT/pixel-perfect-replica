/// <reference types="bun" />
import { describe, it, expect } from "bun:test";
import { allowedNewsUrl, articleText, newsChunks, newsWindow } from "./news-content";
import { newsOpinion } from "./models/news-opinion";

describe("automatic detailed news", () => {
  it("reads article details rather than navigation", () => {
    expect(articleText('<nav>Advertisement</nav><article><p>Arsenal confirmed a player will miss Saturday.</p><p>The manager also announced two returning players.</p></article>')).toBe("Arsenal confirmed a player will miss Saturday.\nThe manager also announced two returning players.");
  });
  it("preserves all text through chunking", () => {
    const text = "detail ".repeat(2000);
    expect(newsChunks(text).join("")).toBe(text);
  });
  it("does not fetch unrelated or private article targets", () => {
    expect(allowedNewsUrl("https://www.bbc.com/sport/football/123", "https://feeds.bbci.co.uk/sport/football/rss.xml")).toBe(true);
    expect(allowedNewsUrl("https://127.0.0.1/admin", "https://gong.bg/rss")).toBe(false);
    expect(allowedNewsUrl("https://gong.bg.evil.test/article", "https://gong.bg/rss")).toBe(false);
  });
  it("excludes future news for historical matches", () => {
    expect(newsWindow("2026-10-10T12:00:00Z", Date.parse("2026-10-17T12:00:00Z"))).toEqual({ start: "2026-10-03T12:00:00.000Z", end: "2026-10-10T12:00:00.000Z" });
  });
  it("uses every linked detail but never rumours or another team's fact", () => {
    const item = { title: "Team update", category: "injury", status: "reported", importance: 4, impact: "Update", team_ids: ["h", "a"], published_at: null,
      news_facts: [
        { category: "injury", status: "official", importance: 4, impact: "Home player is out", sentiment: "negative", team_ids: ["h"] },
        { category: "lineup", status: "reported", importance: 4, impact: "Away player returns", sentiment: "positive", team_ids: ["a"] },
        { category: "manager", status: "rumour", importance: 5, impact: "Home manager may leave", sentiment: "negative", team_ids: ["h"] },
      ] };
    const result = newsOpinion([item], "h", "a", "Home", "Away");
    expect(result.home.negatives).toEqual(["Home player is out"]);
    expect(result.away.positives).toEqual(["Away player returns"]);
    expect(result.away.negatives).toEqual([]);
    expect(result.home.rumours).toBe(1);
  });
});