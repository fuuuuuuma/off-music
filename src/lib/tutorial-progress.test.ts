import { describe, expect, it } from "vitest";
import {
  readTutorialProgress,
  rememberTutorialProgress,
  TUTORIAL_PROGRESS_KEY,
} from "./tutorial-progress.ts";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe("初回チュートリアルの完了・スキップの記録", () => {
  it("初めてのブラウザだけ未実施として扱う", () => {
    expect(readTutorialProgress(storage())).toBeNull();
  });
  it.each(["completed", "skipped"] as const)(
    "%sを再起動後にも読める形で保存",
    (status) => {
      const s = storage();
      rememberTutorialProgress(s, status);
      expect(readTutorialProgress(s)).toBe(status);
    },
  );
  it("スキップした人も後から練習して完了へ進める", () => {
    const s = storage();
    rememberTutorialProgress(s, "skipped");
    rememberTutorialProgress(s, "completed");
    expect(readTutorialProgress(s)).toBe("completed");
  });
  it("練習をやり直して途中で閉じても完了履歴を消さない", () => {
    const s = storage();
    rememberTutorialProgress(s, "completed");
    expect(rememberTutorialProgress(s, "skipped")).toBe("completed");
    expect(readTutorialProgress(s)).toBe("completed");
  });
  it.each([
    "invalid-json",
    "null",
    '{"version":1,"status":"pending"}',
    '{"version":2,"status":"completed"}',
  ])("壊れた値や不明な版を安全に扱う：%s", (raw) => {
    const s = storage();
    s.setItem(TUTORIAL_PROGRESS_KEY, raw);
    expect(readTutorialProgress(s)).toBeNull();
  });
  it("保存を拒否された場合も終了でき、その訪問中の完了は維持する", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readTutorialProgress(blocked)).toBeNull();
    expect(rememberTutorialProgress(blocked, "completed")).toBe("completed");
    expect(rememberTutorialProgress(blocked, "skipped", "completed")).toBe(
      "completed",
    );
    expect(rememberTutorialProgress(undefined, "skipped")).toBe("skipped");
  });
  it("ゲストの実データとQA用ストレージへ互いに書き込まない", () => {
    const real = storage(),
      qa = storage();
    rememberTutorialProgress(qa, "skipped");
    expect(readTutorialProgress(real)).toBeNull();
    expect(readTutorialProgress(qa)).toBe("skipped");
  });
});
