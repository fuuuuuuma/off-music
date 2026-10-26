import { StageSession, type StageFeedback } from "./stage-session.ts";
import { STAGE_WINDOWS } from "./stage-rules.ts";
import type { StageInput, StageNote } from "../types.ts";

const at = 2;
export const TUTORIAL_STEPS: {
  title: string;
  instruction: string;
  key: string;
  note: StageNote;
}[] = [
  {
    title: "タップ",
    instruction: "青い音符が紫の帯に来たら、光る場所を1回タップ。",
    key: "S",
    note: {
      id: 0,
      time: at,
      lane: 1,
      width: 4,
      type: "tap",
      kind: "pulse",
      accent: false,
    },
  },
  {
    title: "長押し",
    instruction: "緑の帯を押したまま。終わりが来たら指を離します。",
    key: "J",
    note: {
      id: 0,
      time: at,
      lane: 4,
      width: 4,
      type: "hold",
      kind: "snap",
      accent: false,
      endTime: at + 1.4,
      tick: 0.25,
    },
  },
  {
    title: "フリック",
    instruction: "ピンクの矢印に合わせて、光る場所から上へサッと動かす。",
    key: "Shift＋K",
    note: {
      id: 0,
      time: at,
      lane: 7,
      width: 4,
      type: "flick",
      kind: "edge",
      accent: false,
      direction: 0,
    },
  },
];
export type TutorialPhase =
  "ready" | "approach" | "waiting" | "holding" | "release" | "success";

/** Local guided clock: arrival waits for the learner. Judgements use the real game engine. */
export class TutorialSession {
  step = 0;
  time = 0;
  phase: TutorialPhase = "ready";
  hint = "";
  readonly completed = new Set<number>();
  engine = new StageSession([TUTORIAL_STEPS[0].note]);
  feedback: StageFeedback | null = null;
  private pointer: number | null = null;
  get lesson() {
    return TUTORIAL_STEPS[this.step];
  }
  get holdProgress() {
    const n = this.lesson.note;
    return n.endTime
      ? Math.max(0, Math.min(1, (this.time - n.time) / (n.endTime - n.time)))
      : 0;
  }
  get allComplete() {
    return this.completed.size === TUTORIAL_STEPS.length;
  }
  reset(hint = "") {
    this.time = 0;
    this.phase = "ready";
    this.pointer = null;
    this.hint = hint;
    this.feedback = null;
    this.engine = new StageSession([this.lesson.note]);
  }
  start() {
    this.reset();
    this.phase = "approach";
  }
  next() {
    if (this.phase !== "success" || this.step === TUTORIAL_STEPS.length - 1)
      return false;
    this.step++;
    this.reset();
    return true;
  }
  advance(seconds: number) {
    if (this.phase === "ready" || this.phase === "success") return;
    const n = this.lesson.note;
    const holding = this.phase === "holding" || this.phase === "release";
    const limit = holding ? n.endTime! : n.time;
    this.time = Math.min(limit, this.time + Math.max(0, seconds));
    this.engine.advance(this.time);
    if (this.engine.stats.miss) {
      this.reset("緑の帯から指が離れました。光る場所を押したまま、もう一度。");
    } else if (this.time >= limit) {
      if (this.phase === "approach") this.hint = "";
      this.phase = holding ? "release" : "waiting";
    }
  }
  input(
    id: number,
    action: StageInput[2],
    x: number,
    y: number,
    gestureTime = this.time,
  ) {
    if (this.phase === "ready" || this.phase === "success") return null;
    if (this.pointer !== null && this.pointer !== id) return null;
    if (action === 0) this.pointer = id;
    else if (this.pointer !== id) return null;
    if (action === 3) {
      this.reset("操作が中断されました。もう一度試せます。");
      return null;
    }
    const n = this.lesson.note;
    const feedback = this.engine.input(
      [
        Math.round(this.time * 1000),
        id,
        action,
        Math.round(x * 100),
        Math.round(y * 1000),
      ],
      gestureTime,
    );
    if (feedback) {
      this.feedback = feedback;
      this.hint = "";
      if (n.type === "hold" && action === 0) this.phase = "holding";
      if (this.engine.status.every((s) => s > 0 && s < 5)) {
        this.phase = "success";
        this.completed.add(this.step);
      }
    } else if (action === 0) {
      this.hint =
        this.time < n.time - STAGE_WINDOWS.bad
          ? "まだ少し早いです。いったん離して、光ったらもう一度。"
          : n.type === "flick"
            ? "そのまま上へサッと動かします。"
            : "光っている横位置を押してみましょう。";
    }
    if (action === 2) {
      this.pointer = null;
      if (n.type === "hold" && this.phase !== "success")
        this.reset("途中で離れました。帯の終わりまで押し続けてみましょう。");
      else if (n.type === "flick" && this.phase !== "success")
        this.hint = "押すだけでなく、指を上へサッと動かしてみましょう。";
    }
    return feedback;
  }
}
