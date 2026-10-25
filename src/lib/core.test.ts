import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { analyzePCM } from "./analysis.ts";
import { calculateScore, createChart, judge, timingDelta } from "./chart.ts";
import type { Analysis, Difficulty } from "../types.ts";
const builtin = JSON.parse(
  readFileSync("public/music/make-something.json", "utf8"),
) as Analysis;
describe("判定と集計", () => {
  it.each([
    [0, "perfect"],
    [0.045, "perfect"],
    [-0.046, "great"],
    [0.1, "great"],
    [0.159, "good"],
    [-0.161, "miss"],
  ])("%s秒を%sで判定する", (delta, grade) =>
    expect(judge(delta as number)).toBe(grade),
  );
  it("全てPERFECTは100万、空譜面は0、重みを正しく集計する", () => {
    expect(calculateScore(100, 0, 0, 100)).toBe(1000000);
    expect(calculateScore(0, 0, 0, 0)).toBe(0);
    expect(calculateScore(1, 1, 1, 4)).toBe(512500);
  });
  it.each([0.75, 1, 1.25])(
    "%s倍速でも判定と遅延調整を実時間で扱う",
    (speed) => {
      expect(judge(timingDelta(10 + 0.04 * speed, 10, speed))).toBe("perfect");
      expect(judge(timingDelta(10 + 0.12 * speed, 10, speed))).toBe("good");
      expect(
        Math.abs(timingDelta(10 + 0.1 * speed, 10, speed, 100)),
      ).toBeLessThan(0.00001);
    },
  );
});
describe("実際の初期曲の譜面", () => {
  it.each(["easy", "normal", "hard", "expert"] as Difficulty[])(
    "%sで時刻順・曲の範囲内・一意のノーツを作る",
    (d) => {
      const notes = createChart(builtin, d);
      expect(notes.length).toBeGreaterThan(30);
      expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
      expect(
        notes.every(
          (n, i) =>
            n.time >= 1 &&
            n.time < builtin.duration &&
            (!i || n.time > notes[i - 1].time),
        ),
      ).toBe(true);
      expect(createChart(builtin, d)).toEqual(notes);
    },
  );
  it("難易度で音符密度が上がる", () => {
    const counts = (["easy", "normal", "hard", "expert"] as Difficulty[]).map(
      (d) => createChart(builtin, d).length,
    );
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });
  it("AIの数値を実際の譜面に反映する", () => {
    const a = createChart(builtin, "normal"),
      b = createChart(builtin, "normal", {
        density: Array(16).fill(1.4),
        edgeBias: 0.2,
        accentEvery: 2,
      });
    expect(b).not.toEqual(a);
    expect(b.length).toBeGreaterThan(a.length);
  });
});
describe("端末で行う音響解析", () => {
  it("無音と短すぎるファイルは拒否する", () => {
    expect(() => analyzePCM(new Float32Array(11025 * 4), 11025)).toThrow("音");
    expect(() => analyzePCM(new Float32Array(100), 11025)).toThrow("3秒");
  });
  it("120BPMの既知のパルス列からテンポと立ち上がりを検出する", () => {
    const sr = 11025,
      samples = new Float32Array(sr * 12);
    for (let t = 0.5; t < 12; t += 0.5) {
      for (let j = 0; j < 800; j++) {
        const i = Math.floor(t * sr) + j;
        if (i < samples.length)
          samples[i] =
            Math.sin((2 * Math.PI * 110 * j) / sr) * Math.exp(-j / 130);
      }
    }
    const a = analyzePCM(samples, sr);
    expect(Math.abs(a.bpm - 120)).toBeLessThan(2);
    expect(a.peaks.length).toBeGreaterThan(18);
    expect(a.waveform).toHaveLength(100);
    expect(a.energy).toHaveLength(16);
    expect(a.peaks.some((p) => Math.abs(p.time - 3) < 0.06)).toBe(true);
  });
});
