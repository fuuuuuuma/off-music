import { describe, it, expect } from "vitest";
import { noteX, travelSeconds, effectiveBpm } from "./motion.ts";
import { discover } from "./discovery.ts";
import { difficultyUnlocked, progression } from "./progression.ts";
import {createChart} from "./chart.ts";
import type {Analysis} from "../types.ts";
import type { Song, Result } from "../types.ts";
describe("BPMと再生速度に連動する流速", () => {
  it.each([80, 120, 180, 240])(
    "%s BPMでも音が鳴る時刻に判定線へ到着",
    (bpm) => {
      for (const speed of [0.75, 1, 1.25])
        for (const scroll of [0.8, 1, 2]) {
          const note = 10,
            sourceTime = note;
          expect(noteX(note, sourceTime, 844, bpm, scroll)).toBeCloseTo(
            844 * 0.16,
            6,
          );
          const x1 = noteX(note, sourceTime - 0.2 * speed, 844, bpm, scroll);
          expect(x1).toBeGreaterThan(844 * 0.16);
        }
    },
  );
  it("速い曲は速く流れ、再生速度を上げても表示速度が相殺されない", () => {
    const width = 844,
      velocity = (bpm: number, speed: number) =>
        noteX(10, 9, width, bpm) - noteX(10, 9 + 0.1 * speed, width, bpm);
    expect(velocity(180, 1) / velocity(90, 1)).toBeCloseTo(2, 8);
    expect(velocity(120, 1.25) / velocity(120, 1)).toBeCloseTo(1.25, 8);
    expect(travelSeconds(80)).toBe(3);
    expect(travelSeconds(120)).toBe(2);
    expect(effectiveBpm(180, 0.75)).toBe(135);
  });
});
describe("人気・新着・おすすめ", () => {
  const songs = [
    { id: "a", title: "A", bpm: 120, addedAt: 100, playCount: 50 },
    { id: "b", title: "B", bpm: 90, addedAt: 300, playCount: 2 },
    { id: "c", title: "C", bpm: 180, addedAt: 200, playCount: 5 },
  ] as Song[];
  it("人気は完了回数、新着は公開時刻の降順", () => {
    expect(discover(songs, "popular", [], 1, 400).map((s) => s.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(discover(songs, "new", [], 1, 400).map((s) => s.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
  it("おすすめは未プレイと初級向けの曲を拾い、元の配列を変更しない", () => {
    const copy = songs.map((x) => x.id),
      history = [{ songId: "a" }] as Result[];
    expect(discover(songs, "recommended", history, 1, 400)[0].id).toBe("b");
    expect(songs.map((x) => x.id)).toEqual(copy);
  });
});
describe("難易度の実際の解放", () => {
  it("初期3種類・Lv.5で鬼、ステータスと順位称号を追加する", () => {
    expect(
      ["easy", "normal", "hard"].every((d) => difficultyUnlocked(1, d)),
    ).toBe(true);
    expect(difficultyUnlocked(4, "expert")).toBe(false);
    expect(difficultyUnlocked(5, "expert")).toBe(true);
    expect(progression(320, 5).statuses).toContain("音楽好き");
    expect(
      progression(165, 1, 0, 100, ["rank:first", "rank:podium"]).badges,
    ).toEqual(expect.arrayContaining(["ランキング1位", "表彰台"]));
  });
});

describe("テンポ調整で選音を変える",()=>{
  it("表示と演奏は同じ譜面を使い、元の発音時刻を保持する",()=>{
    const peaks=Array.from({length:24},(_,i)=>({time:1+i*.125,strength:1,bass:.4,confidence:1,kind:"pulse" as const}));
    const analysis={duration:5,bpm:120,offset:0,peaks} as Analysis;
    const normal=createChart(analysis,"normal");
    const fast=createChart(analysis,"normal",undefined,240);
    expect(fast.length).toBeGreaterThan(normal.length);
    expect(fast.every(n=>peaks.some(p=>p.time===n.time))).toBe(true);
  });
});
