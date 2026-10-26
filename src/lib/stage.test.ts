import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createChart, stagePoints, laneAt } from "./stage-chart.ts";
import { StageSession, replayStage, stageJudge } from "./stage-session.ts";
import {
  stageProgress,
  projectLane,
  touchLane,
  stageGeometry,
} from "./stage-geometry.ts";
import { perfectInputs } from "./stage-fixtures.ts";
import { difficultyUnlocked } from "./progression.ts";
import { STAGE_WINDOWS } from "./stage-rules.ts";
import type { Analysis, StageNote, StageInput } from "../types.ts";
const builtin = JSON.parse(
  readFileSync("public/music/play-pay.json", "utf8"),
) as Analysis;
const tap: StageNote = {
  id: 0,
  time: 1,
  kind: "pulse",
  accent: false,
  type: "tap",
  lane: 1,
  width: 2,
};
const flick: StageNote = { ...tap, type: "flick", direction: 1 };
const hold: StageNote = {
  ...tap,
  type: "hold",
  endTime: 2,
  tick: 0.25,
  path: [
    { time: 1, lane: 1 },
    { time: 1.5, lane: 4 },
    { time: 2, lane: 1 },
  ],
};
describe("譜面生成と2本の指での配置", () => {
  it.each(["easy", "normal", "hard", "expert", "master"] as const)(
    "%sの5難易度が決定的・画面内・実測発音開始",
    (d) => {
      const notes = createChart(builtin, d);
      expect(createChart(builtin, d)).toEqual(notes);
      expect(
        notes.every(
          (n, i) =>
            n.id === i &&
            n.lane >= 0 &&
            n.lane + n.width <= 12 &&
            (!i || n.time >= notes[i - 1].time),
        ),
      ).toBe(true);
      expect(
        notes.every((n) => builtin.peaks.some((p) => p.time === n.time)),
      ).toBe(true);
      expect(notes.some((n) => n.type === "hold")).toBe(true);
      if (d !== "easy")
        expect(notes.some((n) => n.type === "flick")).toBe(true);
      expect(
        notes
          .filter((n) => n.type === "hold")
          .every((n) => builtin.peaks.some((p) => p.time === n.endTime)),
      ).toBe(true);
      expect(new Set(notes.map((n) => n.width)).size).toBeGreaterThanOrEqual(1);
    },
  );
  it("MASTERに向かってコンボ数が増え、全難易度で完全入力を再現", () => {
    const counts = [];
    for (const d of ["easy", "normal", "hard", "expert", "master"] as const) {
      const notes = createChart(builtin, d),
        s = replayStage(notes, perfectInputs(notes));
      counts.push(s.total);
      expect(s.miss, { d, miss: s.miss, bad: s.bad, good: s.good }).toBe(0);
      expect(s.score, { d, ...s, deltas: undefined }).toBe(1000000);
      expect(s.maxCombo).toBe(s.total);
    }
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });
  it("ホールド中はもう片方の半面だけへ別ノーツを配置する", () => {
    const notes = createChart(builtin, "master");
    for (const h of notes.filter((n) => n.type === "hold")) {
      const left = h.lane < 6;
      for (const n of notes.filter(
        (n) => n.id !== h.id && n.time > h.time && n.time < h.endTime!,
      ))
        expect(left ? n.lane >= 6 : n.lane + n.width <= 6).toBe(true);
    }
  });
});
describe("位置・保持・フリック・複数の指", () => {
  it.each([
    [0.08, "perfect"],
    [0.081, "great"],
    [0.16, "great"],
    [0.161, "good"],
    [0.24, "good"],
    [0.241, "bad"],
    [0.32, "bad"],
    [0.321, "miss"],
  ] as const)("前後%s秒の境界を説明と同じ判定にする", (delta, grade) => {
    expect(stageJudge(delta)).toBe(grade);
    expect(stageJudge(-delta)).toBe(grade);
  });
  it.each([0.75, 1, 1.25])(
    "%s倍速で前後320msまで得点し、外側は得点しない",
    (speed) => {
      for (const sign of [-1, 1]) {
        const at = 1 + sign * STAGE_WINDOWS.bad * speed;
        const s = replayStage(
          [tap],
          [[Math.round(at * 1000), 1, 0, 200, 500]],
          speed,
        );
        expect(s.bad).toBe(1);
        expect(s.score).toBe(100000);
        const outside = 1 + sign * (STAGE_WINDOWS.bad + 0.004) * speed;
        expect(
          replayStage(
            [tap],
            [[Math.round(outside * 1000), 1, 0, 200, 500]],
            speed,
          ).score,
        ).toBe(0);
      }
    },
  );
  it("音符の左右0.85レーンまで許容し、さらに外側や空振りは加点しない", () => {
    for (const x of [15, 50, 350, 385])
      expect(replayStage([tap], [[1000, 1, 0, x, 500]]).perfect).toBe(1);
    for (const x of [14, 386, 900])
      expect(replayStage([tap], [[1000, 1, 0, x, 500]]).score).toBe(0);
    expect(replayStage([], [[1000, 1, 0, 200, 500]]).score).toBe(0);
  });
  it("スライドの動きで終端直後の別フリックが早期反応しない", () => {
    const upcoming = { ...flick, id: 1, time: 2.15, lane: 6 };
    const s = replayStage([hold, upcoming], perfectInputs([hold, upcoming]));
    expect(s.score).toBe(1000000);
    expect(s.bad).toBe(0);
  });
  it("時刻が一致しても違うレーンは失敗し、正しい位置は成功", () => {
    expect(replayStage([tap], [[1000, 1, 0, 900, 850]]).score).toBe(0);
    expect(replayStage([tap], perfectInputs([tap])).score).toBe(1000000);
  });
  it("同時押しは別の2本の指でそれぞれ判定する", () => {
    const notes = [tap, { ...tap, id: 1, lane: 8 }];
    expect(replayStage(notes, perfectInputs(notes)).maxCombo).toBe(2);
    expect(replayStage(notes, [[1000, 1, 0, 200, 850]]).perfect).toBe(1);
  });
  it("フリックはタップのみでは失敗、動かすと成功し、逆方向はGREAT/FLICK", () => {
    expect(
      replayStage(
        [flick],
        [
          [1000, 1, 0, 200, 850],
          [1020, 1, 2, 200, 850],
        ],
      ).miss,
    ).toBe(1);
    expect(replayStage([flick], perfectInputs([flick])).perfect).toBe(1);
    const wrong = replayStage(
      [flick],
      [
        [975, 1, 0, 200, 850],
        [1000, 1, 1, 150, 850],
        [1010, 1, 2, 150, 850],
      ],
    );
    expect(wrong.great).toBe(1);
    expect(wrong.flickErrors).toBe(1);
  });
  it("ロングは頭を叩くだけでは完了せず、経路追従と終端リリースが必要", () => {
    expect(replayStage([hold], perfectInputs([hold])).score).toBe(1000000);
    const tapOnly = replayStage(
      [hold],
      [
        [1000, 1, 0, 200, 850],
        [1020, 1, 2, 200, 850],
      ],
    );
    expect(tapOnly.miss).toBeGreaterThan(1);
    const noPath = replayStage(
      [hold],
      [
        [1000, 1, 0, 200, 850],
        [2000, 1, 2, 200, 850],
      ],
    );
    expect(noPath.miss).toBeGreaterThan(0);
  });
  it("終端フリックとリリースを区別し、キャンセルで保持を解除", () => {
    const n = { ...hold, endFlick: true, direction: 0 as const };
    expect(replayStage([n], perfectInputs([n])).score).toBe(1000000);
    const inputs = perfectInputs([hold]);
    inputs[1] = [1050, 1, 3, 200, 850];
    expect(replayStage([hold], inputs).miss).toBeGreaterThan(0);
    expect(replayStage([n], perfectInputs([hold])).miss).toBeGreaterThan(0);
  });
  it("存在しない指のmove/up、重複downでコンボを作らない", () => {
    expect(
      replayStage(
        [flick],
        [
          [1000, 1, 1, 200, 690],
          [1000, 1, 2, 200, 690],
        ],
      ).score,
    ).toBe(0);
    expect(
      replayStage(
        [tap, { ...tap, id: 1 }],
        [
          [1000, 1, 0, 200, 850],
          [1000, 1, 0, 200, 850],
        ],
      ).perfect,
    ).toBe(1);
  });
  it("GOOD/BADはコンボを切り、MISSはライフを減らす", () => {
    const s = replayStage(
      [tap, { ...tap, id: 1, time: 2 }, { ...tap, id: 2, time: 3 }],
      [
        [1000, 1, 0, 200, 850],
        [1020, 1, 2, 200, 850],
        [2210, 1, 0, 200, 850],
        [2230, 1, 2, 200, 850],
      ],
    );
    expect(s.good).toBe(1);
    expect(s.miss).toBe(1);
    expect(s.maxCombo).toBe(1);
    expect(s.life).toBeLessThan(1000);
    expect(stageJudge(0.29)).toBe("bad");
    expect(stageJudge(0.321)).toBe("miss");
  });
  it.each([0.75, 1, 1.25])("%s倍速でも現実時間の判定幅を保つ", (speed) => {
    const s = replayStage(
      [tap],
      [[Math.round((1 + 0.03 * speed) * 1000), 1, 0, 200, 850]],
      speed,
    );
    expect(s.perfect).toBe(1);
    expect(Math.abs(s.meanOffset - 30)).toBeLessThan(1);
  });
  it("ライフが0になったら後から回復してもクリア扱いへ戻さない", () => {
    const notes = Array.from({ length: 20 }, (_, i) => ({
      ...tap,
      id: i,
      time: 1 + i * 0.3,
    }));
    const inputs: StageInput[] = [[6700, 1, 0, 200, 850]];
    const result = replayStage(notes, inputs);
    expect(result.perfect).toBe(1);
    expect(result.failed).toBe(true);
    expect(result.cleared).toBe(false);
  });
  it("止めた指でも最後の上方向フリックを判定し、経路移動では暴発しない", () => {
    const n = { ...hold, endFlick: true, direction: 0 as const };
    const s = replayStage([n], perfectInputs([n]));
    expect(s.perfect).toBe(s.total);
    expect(s.early).toBe(0);
  });
  it("描画フレームを挟んでもリプレイと同じ判定・得点", () => {
    const notes = createChart(builtin, "hard").filter((n) => n.time < 15);
    const inputs = perfectInputs(notes),
      session = new StageSession(notes);
    let t = 0;
    for (const e of inputs) {
      while (t < e[0] / 1000) {
        session.advance(t - 0.05);
        t += 1 / 60;
      }
      session.input(e);
    }
    const a = session.finish(),
      b = replayStage(notes, inputs);
    expect([
      a.score,
      a.perfect,
      a.great,
      a.good,
      a.bad,
      a.miss,
      a.maxCombo,
    ]).toEqual([
      b.score,
      b.perfect,
      b.great,
      b.good,
      b.bad,
      b.miss,
      b.maxCombo,
    ]);
  });
});
describe("透視レーンの同期・タッチ座標・解放", () => {
  it.each([80, 144.3, 240])(
    "%s BPMで遅れた音符も新しい判定幅の間は画面内に残す",
    (bpm) => {
      for (const speed of [0.75, 1, 1.25]) {
        const progress = stageProgress(
          10,
          10 + STAGE_WINDOWS.bad * speed,
          bpm,
          1,
          speed,
        );
        const position = projectLane(6, progress, 844, 300);
        expect(position.y).toBeGreaterThan(stageGeometry(844, 300).line);
        expect(position.y).toBeLessThan(300 - 8);
      }
    },
  );
  it.each([80, 120, 180, 240])("%sBPMでも発音時刻は判定線へ到着", (bpm) => {
    for (const speed of [0.75, 1, 1.25])
      for (const scroll of [0.8, 1, 2]) {
        const p = stageProgress(10, 10, bpm, scroll),
          a = projectLane(6, p, 844, 300);
        expect(a.y).toBeCloseTo(stageGeometry(844, 300).line);
        expect(a.x).toBe(422);
        expect(stageProgress(10, 10 - 0.1 * speed, bpm, scroll)).toBeLessThan(
          1,
        );
      }
  });
  it("判定線のタッチと描画の横位置は一致し、スライドを補間する", () => {
    for (let lane = 0; lane <= 12; lane += 0.5)
      expect(touchLane(projectLane(lane, 1, 667, 280).x, 667)).toBeCloseTo(
        lane,
      );
    expect(laneAt(hold, 1.5)).toBe(4);
    expect(laneAt(hold, 1.25)).toBeCloseTo(2.5);
  });
  it("Lv5でEXPERT、Lv8でMASTERを解放", () => {
    expect(difficultyUnlocked(4, "expert")).toBe(false);
    expect(difficultyUnlocked(5, "expert")).toBe(true);
    expect(difficultyUnlocked(7, "master")).toBe(false);
    expect(difficultyUnlocked(8, "master")).toBe(true);
  });
});
