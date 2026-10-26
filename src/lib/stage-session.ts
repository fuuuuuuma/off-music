import { laneAt, stagePoints } from "./stage-chart.ts";
import type { StageGrade, StageInput, StageNote } from "../types.ts";
import {
  STAGE_WINDOWS,
  STAGE_GRADES,
  STAGE_LANE_PADDING,
  STAGE_MAX_SCORE,
} from "./stage-rules.ts";
export { STAGE_WINDOWS } from "./stage-rules.ts";
const EPSILON = 1e-9;
export function stageJudge(delta: number): StageGrade {
  const d = Math.abs(delta);
  return d <= STAGE_WINDOWS.perfect + EPSILON
    ? "perfect"
    : d <= STAGE_WINDOWS.great + EPSILON
      ? "great"
      : d <= STAGE_WINDOWS.good + EPSILON
        ? "good"
        : d <= STAGE_WINDOWS.bad + EPSILON
          ? "bad"
          : "miss";
}
type Pointer = {
  holdNote?: number;
  x: number;
  y: number;
  at: number;
  anchorX: number;
  anchorY: number;
  anchorAt: number;
};
export interface StageFeedback {
  grade: StageGrade;
  delta: number;
  note: number;
  time: number;
  flickError?: boolean;
}
export class StageSession {
  readonly points;
  readonly status: Uint8Array;
  readonly pointers = new Map<number, Pointer>();
  readonly noteHeads: number[];
  cursor = 0;
  earned = 0;
  totalWeight = 0;
  lastTime = -Infinity;
  lastInputTime = -Infinity;
  feedback: StageFeedback | null = null;
  stats = {
    perfect: 0,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
    combo: 0,
    maxCombo: 0,
    early: 0,
    late: 0,
    flickErrors: 0,
    life: 1000,
    failed: false,
    deltas: [] as number[],
  };
  readonly notes: StageNote[];
  readonly speed: number;
  constructor(notes: StageNote[], speed = 1) {
    this.notes = notes;
    this.speed = speed;
    this.points = stagePoints(notes);
    this.status = new Uint8Array(this.points.length);
    this.noteHeads = Array(notes.length).fill(-1);
    this.points.forEach((p, i) => {
      if (this.noteHeads[p.note] < 0) this.noteHeads[p.note] = i;
    });
    this.totalWeight = this.points.reduce(
      (s, p) => s + (notes[p.note].accent ? 2 : 1),
      0,
    );
  }
  private contains(index: number, x: number, time: number) {
    const n = this.notes[index],
      left = laneAt(n, time);
    return (
      x >= left - STAGE_LANE_PADDING - EPSILON &&
      x <= left + n.width + STAGE_LANE_PADDING + EPSILON
    );
  }
  private award(
    index: number,
    grade: StageGrade,
    delta: number,
    at: number,
    flickError = false,
  ) {
    if (this.status[index]) return;
    this.status[index] = { perfect: 1, great: 2, good: 3, bad: 4, miss: 5 }[
      grade
    ];
    const s = this.stats,
      p = this.points[index];
    s[grade]++;
    this.earned +=
      STAGE_GRADES[grade].ratio * (this.notes[p.note].accent ? 2 : 1);
    if (STAGE_GRADES[grade].combo) {
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
    } else s.combo = 0;
    s.life = Math.max(0, Math.min(1000, s.life + STAGE_GRADES[grade].life));
    if (s.life === 0) s.failed = true;
    if (grade !== "miss" && p.type !== "tick") {
      s.deltas.push(delta * 1000);
      if (delta < -0.018) s.early++;
      if (delta > 0.018) s.late++;
    }
    if (flickError) s.flickErrors++;
    this.feedback = { grade, delta, note: p.note, time: at, flickError };
  }
  advance(time: number) {
    if (time < this.lastTime) return;
    this.lastTime = time;
    for (let i = this.cursor; i < this.points.length; i++) {
      const p = this.points[i];
      if (p.time > time) break;
      if (this.status[i]) continue;
      if (p.type === "tick" && time >= p.time + 0.04 * this.speed) {
        const held = [...this.pointers.values()].some((v) =>
          this.contains(p.note, v.x, p.time),
        );
        this.award(i, held ? "perfect" : "miss", 0, p.time);
      } else if (time > p.time + STAGE_WINDOWS.bad * this.speed + EPSILON)
        this.award(i, "miss", 0, p.time);
    }
    while (this.cursor < this.points.length && this.status[this.cursor])
      this.cursor++;
  }
  input(event: StageInput) {
    const [ms, id, action, rawX, rawY] = event,
      time = ms / 1000,
      x = rawX / 100,
      y = rawY / 1000;
    if (time < this.lastInputTime) return null;
    this.lastInputTime = time;
    this.advance(time);
    const prior = this.feedback;
    if (action === 0) {
      if (this.pointers.has(id)) return null;
      this.pointers.set(id, {
        x,
        y,
        at: time,
        anchorX: x,
        anchorY: y,
        anchorAt: time,
      });
      const i = this.closest(time, x, ["head", "flick"]);
      const pointer = this.pointers.get(id)!;
      if (i >= 0 && this.notes[this.points[i].note].type === "hold")
        pointer.holdNote = this.points[i].note;
      else {
        // Replacing a finger after a pause also belongs to that active slide.
        const active = this.notes.findIndex(
          (n, index) =>
            n.type === "hold" &&
            n.endTime &&
            n.time <= time &&
            n.endTime >= time &&
            this.contains(index, x, time),
        );
        if (active >= 0) pointer.holdNote = active;
      }
      if (i >= 0 && this.points[i].type === "head")
        this.award(
          i,
          stageJudge((time - this.points[i].time) / this.speed),
          (time - this.points[i].time) / this.speed,
          time,
        );
    } else {
      const v = this.pointers.get(id);
      if (!v) return null;
      if (action === 3) {
        this.pointers.delete(id);
        return null;
      }
      if ((time - v.anchorAt) / this.speed > 0.2) {
        v.anchorX = v.x;
        v.anchorY = v.y;
        v.anchorAt = Math.max(v.at, time - 0.016 * this.speed);
      }
      const dx = x - v.anchorX,
        dy = y - v.anchorY,
        elapsed = (time - v.anchorAt) / this.speed;
      if (
        (action === 1 || action === 2) &&
        elapsed >= 0 &&
        elapsed <= 0.2 &&
        (Math.abs(dx) >= 0.3 || Math.abs(dy) >= 0.035)
      ) {
        const tail =
          Math.abs(dy) >= 0.035
            ? this.closest(time, v.x, ["flickTail"], v.holdNote)
            : -1;
        // Following a slide must not accidentally flick a nearby upcoming note.
        const i =
          tail >= 0
            ? tail
            : v.holdNote !== undefined
              ? -1
              : this.closest(time, v.anchorX, ["flick"]);
        if (i >= 0) {
          const p = this.points[i],
            n = this.notes[p.note],
            wrong =
              !!n.direction &&
              Math.sign(dx) === -n.direction &&
              Math.abs(dx) > Math.abs(dy) * 8;
          const delta = (time - p.time) / this.speed,
            grade = stageJudge(delta);
          this.award(
            i,
            wrong && grade === "perfect" ? "great" : grade,
            delta,
            time,
            wrong,
          );
          v.anchorX = x;
          v.anchorY = y;
          v.anchorAt = time;
        }
      }
      v.x = x;
      v.y = y;
      v.at = time;
      if (action === 2) {
        const i = this.closest(time, x, ["tail"], v.holdNote);
        if (i >= 0) {
          const delta = (time - this.points[i].time) / this.speed;
          this.award(i, stageJudge(delta), delta, time);
        }
        this.pointers.delete(id);
      }
    }
    return this.feedback !== prior ? this.feedback : null;
  }
  private closest(time: number, x: number, types: string[], note?: number) {
    let index = -1,
      distance = Infinity;
    for (let i = this.cursor; i < this.points.length; i++) {
      const p = this.points[i];
      if (p.time > time + STAGE_WINDOWS.bad * this.speed + EPSILON) break;
      const d = Math.abs(time - p.time);
      if (
        !this.status[i] &&
        (note === undefined || p.note === note) &&
        types.includes(p.type) &&
        d <= STAGE_WINDOWS.bad * this.speed + EPSILON &&
        d < distance &&
        this.contains(p.note, x, p.time)
      ) {
        index = i;
        distance = d;
      }
    }
    return index;
  }
  get score() {
    return this.totalWeight
      ? Math.round((this.earned / this.totalWeight) * STAGE_MAX_SCORE)
      : 0;
  }
  finish() {
    this.advance(Infinity);
    const s = this.stats;
    return {
      ...s,
      score: this.score,
      accuracy: this.score / 10000,
      total: this.points.length,
      cleared: !s.failed && s.life > 0,
      meanOffset: s.deltas.length
        ? s.deltas.reduce((a, b) => a + b, 0) / s.deltas.length
        : 0,
    };
  }
}
export function replayStage(
  notes: StageNote[],
  inputs: StageInput[],
  speed = 1,
) {
  const session = new StageSession(notes, speed);
  for (const event of inputs) session.input(event);
  return session.finish();
}
