import { describe, expect, it } from "vitest";
import { TutorialSession } from "./tutorial.ts";

const tap = (s: TutorialSession) => {
  s.start();
  s.advance(2);
  s.input(1, 0, 3, 0.85);
  s.input(1, 2, 3, 0.85);
};
const holdLesson = () => {
  const s = new TutorialSession();
  tap(s);
  s.next();
  s.start();
  s.advance(2);
  return s;
};
describe("光るガイドの操作チュートリアル", () => {
  it("成功するまでは次へ進めず、タップ成功でだけ次を解放", () => {
    const s = new TutorialSession();
    expect(s.next()).toBe(false);
    tap(s);
    expect(s.phase).toBe("success");
    expect(s.completed.has(0)).toBe(true);
    expect(s.next()).toBe(true);
    expect(s.step).toBe(1);
    expect(s.phase).toBe("ready");
  });
  it("初心者を待ち、判定線で何秒待ってもMISSにしない", () => {
    const s = new TutorialSession();
    s.start();
    s.advance(500);
    expect(s.time).toBe(2);
    expect(s.phase).toBe("waiting");
    s.advance(500);
    expect(s.engine.stats.miss).toBe(0);
    s.input(1, 0, 3, 0.85);
    expect(s.phase).toBe("success");
  });
  it("早すぎるタップと違う横位置は成功にならず、案内して再入力できる", () => {
    const s = new TutorialSession();
    s.start();
    s.advance(0.5);
    s.input(1, 0, 3, 0.85);
    s.input(1, 2, 3, 0.85);
    expect(s.hint).toContain("早い");
    expect(s.completed.size).toBe(0);
    s.advance(2);
    expect(s.hint).toBe("");
    s.input(2, 0, 10, 0.85);
    s.input(2, 2, 10, 0.85);
    expect(s.phase).toBe("waiting");
    s.input(3, 0, 3, 0.85);
    expect(s.phase).toBe("success");
  });
  it("実際と同じ広い時間と横位置の判定を使う", () => {
    const s = new TutorialSession();
    s.start();
    s.advance(1.75);
    s.input(1, 0, 0.3, 0.5);
    expect(s.phase).toBe("success");
    expect(s.feedback?.grade).toBe("bad");
  });
  it("長押しの始点だけ、または途中で離す操作では成功しない", () => {
    const s = holdLesson();
    s.input(1, 0, 6, 0.85);
    s.advance(0.4);
    s.input(1, 2, 6, 0.85);
    expect(s.phase).toBe("ready");
    expect(s.completed.has(1)).toBe(false);
    expect(s.hint).toContain("途中");
  });
  it("長押しを維持し、離す合図で待ち、最後のリリースで成功する", () => {
    const s = holdLesson();
    s.input(1, 0, 6, 0.85);
    s.advance(1.4);
    expect(s.phase).toBe("release");
    expect(s.holdProgress).toBe(1);
    expect(s.completed.has(1)).toBe(false);
    s.advance(50);
    expect(s.time).toBe(3.4);
    expect(s.engine.stats.miss).toBe(0);
    s.input(1, 2, 6, 0.85);
    expect(s.phase).toBe("success");
    expect(s.engine.score).toBe(1_000_000);
  });
  it("長押しから指が外れた時は復帰できる案内へ戻す", () => {
    const s = holdLesson();
    s.input(1, 0, 6, 0.85);
    s.input(1, 1, 12, 0.85);
    s.advance(0.4);
    expect(s.phase).toBe("ready");
    expect(s.hint).toContain("指が離れ");
  });
  it("別の指を離しても保持中の指の終了と扱わない", () => {
    const s = holdLesson();
    s.input(1, 0, 6, 0.85);
    s.input(2, 0, 6, 0.85);
    s.input(2, 2, 6, 0.85);
    expect(s.phase).toBe("holding");
    s.advance(1.4);
    s.input(1, 2, 6, 0.85);
    expect(s.phase).toBe("success");
  });
  it("フリックはタップだけでは進まず、上への実移動で成功する", () => {
    const s = holdLesson();
    s.input(1, 0, 6, 0.85);
    s.advance(1.4);
    s.input(1, 2, 6, 0.85);
    s.next();
    s.start();
    s.advance(2);
    s.input(1, 0, 9, 0.85);
    s.input(1, 2, 9, 0.85);
    expect(s.phase).toBe("waiting");
    expect(s.hint).toContain("指を上へ");
    s.input(2, 0, 9, 0.85);
    s.input(2, 1, 9, 0.69);
    expect(s.phase).toBe("success");
    expect(s.allComplete).toBe(true);
    expect(s.next()).toBe(false);
  });
  it("判定線で時刻が止まっていても、ゆっくりしたドラッグはフリックにしない", () => {
    const s = holdLesson();
    s.input(1, 0, 6, 0.85);
    s.advance(1.4);
    s.input(1, 2, 6, 0.85);
    s.next();
    s.start();
    s.advance(2);
    s.input(1, 0, 9, 0.85, 100);
    for (let i = 1; i <= 6; i++)
      s.input(1, 1, 9, 0.85 - i * 0.01, 100 + i * 0.1);
    s.input(1, 2, 9, 0.79, 100.7);
    expect(s.phase).toBe("waiting");
    s.input(2, 0, 9, 0.85, 101);
    s.input(2, 1, 9, 0.69, 101.08);
    expect(s.phase).toBe("success");
  });
  it("キャンセルや回転時のリセットは保持を解除し、前の成功を残す", () => {
    const s = holdLesson();
    s.input(1, 0, 6, 0.85);
    s.input(1, 3, 6, 0.85);
    expect(s.phase).toBe("ready");
    expect(s.engine.pointers.size).toBe(0);
    expect(s.completed.has(0)).toBe(true);
    s.start();
    s.advance(2);
    s.input(1, 0, 6, 0.85);
    s.reset("再開できます");
    expect(s.engine.pointers.size).toBe(0);
    expect(s.next()).toBe(false);
  });
});
