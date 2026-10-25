import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createChart, JudgementSession, replayChart } from "./chart.ts";
import { progression, playXp } from "./progression.ts";
import { HIT_KINDS, type Analysis } from "../types.ts";
const a = JSON.parse(
  readFileSync("public/music/play-pay.json", "utf8"),
) as Analysis;
describe("発音を動かさない3音の譜面", () => {
  it.each(["easy", "normal", "hard", "expert"] as const)(
    "%sの全音符は解析した発音位置そのもの",
    (d) => {
      const notes = createChart(a, d);
      expect(
        notes.every((n) =>
          a.peaks.some((p) => p.time === n.time && p.kind === n.kind),
        ),
      ).toBe(true);
      expect(new Set(notes.map((n) => n.kind)).size).toBe(3);
    },
  );
  it("AIは音符を増減しても発音位置をずらさない", () => {
    const n = createChart(a, "normal", {
      density: Array(16).fill(1.3),
      edgeBias: 0.2,
      accentEvery: 2,
    });
    expect(n.every((n) => a.peaks.some((p) => p.time === n.time))).toBe(true);
  });
});
describe("クライアントとサーバー共通の判定", () => {
  const notes = [
    { id: 0, time: 1, kind: "pulse" as const, accent: false },
    { id: 1, time: 2, kind: "snap" as const, accent: false },
    { id: 2, time: 3, kind: "edge" as const, accent: false },
  ];
  it("違うボタンで消化されず、直後の正しいボタンは判定する", () => {
    const s = new JudgementSession(notes);
    expect(s.hit("edge", 1)).toBeNull();
    expect(s.hit("pulse", 1)?.grade).toBe("perfect");
    expect(s.hit("pulse", 1)).toBeNull();
  });
  it("EARLY/LATEとコンボ切れがリプレイから再現できる", () => {
    const s = replayChart(notes, [
      [970, 0],
      [2070, 1],
    ]);
    expect(s.perfect).toBe(1);
    expect(s.great).toBe(1);
    expect(s.miss).toBe(1);
    expect(s.early).toBe(1);
    expect(s.late).toBe(1);
    expect(s.maxCombo).toBe(2);
    expect(s.score).toBe(566667);
  });
  it.each([0.75, 1, 1.25])("%s倍でも判定窓は実時間45ms", (speed) => {
    const hits = notes.map(
      (n) =>
        [
          Math.round((n.time + 0.04 * speed) * 1000),
          HIT_KINDS.indexOf(n.kind),
        ] as [number, number],
    );
    expect(replayChart(notes, hits, speed).score).toBe(1000000);
  });
});
describe("成長と解放", () => {
  it("XPの境界でレベルとテーマを解放する", () => {
    expect(progression(79).level).toBe(1);
    expect(progression(80).level).toBe(2);
    expect(progression(320).themes).toContain("sunset");
    expect(progression(1280).themes).toContain("neon");
    expect(progression(3920).themes).toContain("aurora");
  });
  it("プレイ量・追加曲・コンボのバッジとXP上限", () => {
    expect(progression(10, 10, 3, 100).badges).toEqual(
      expect.arrayContaining(["選曲家", "キュレーター", "100コンボ"]),
    );
    expect(playXp(1000000, 0)).toBe(80);
    expect(playXp(0, 100)).toBe(20);
  });
});
