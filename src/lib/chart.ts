import {
  HIT_KINDS,
  type Analysis,
  type Arrangement,
  type Difficulty,
  type Grade,
  type Note,
  type ReplayHit,
} from "../types.ts";
export const CHART_VERSION = "onset-v2.1";
export const WINDOWS = { perfect: 0.045, great: 0.1, good: 0.16 };
export function timingDelta(
  songTime: number,
  noteTime: number,
  speed: number,
  offsetMs = 0,
) {
  return (songTime - noteTime) / speed - offsetMs / 1000;
}
export function judge(delta: number): Grade {
  const d = Math.abs(delta);
  return d <= WINDOWS.perfect
    ? "perfect"
    : d <= WINDOWS.great
      ? "great"
      : d <= WINDOWS.good
        ? "good"
        : "miss";
}
export function createChart(
  analysis: Analysis,
  difficulty: Difficulty,
  arrangement?: Arrangement,
  bpmOverride?: number,
): Note[] {
  const beat = 60 / (bpmOverride || analysis.bpm),
    minGap = {
      easy: beat * 0.85,
      normal: beat * 0.42,
      hard: beat * 0.27,
      expert: Math.max(0.075, beat * 0.16),
    }[difficulty],
    threshold = { easy: 0.37, normal: 0.22, hard: 0.14, expert: 0.1 }[
      difficulty
    ];
  const selected: Note[] = [];
  let last = -5;
  for (const p of analysis.peaks) {
    if (p.time < 0.7 || p.time >= analysis.duration - 0.25) continue;
    const density =
      arrangement?.density[
        Math.min(15, Math.floor((p.time / analysis.duration) * 16))
      ] ?? 1;
    if (
      p.time - last < minGap / Math.max(0.65, density) ||
      p.strength < threshold / Math.max(0.65, density)
    )
      continue;
    const kind =
      p.kind || (p.bass > 0.21 ? "pulse" : p.bass < 0.09 ? "edge" : "snap");
    selected.push({
      id: selected.length,
      time: p.time,
      kind,
      accent: p.strength > 0.68,
    });
    last = p.time;
  }
  return selected;
}
export function calculateScore(
  perfect: number,
  great: number,
  good: number,
  total: number,
) {
  return total
    ? Math.round(((perfect + great * 0.7 + good * 0.35) / total) * 1000000)
    : 0;
}
export interface SessionStats {
  perfect: number;
  great: number;
  good: number;
  miss: number;
  combo: number;
  maxCombo: number;
  early: number;
  late: number;
  deltas: number[];
}
export class JudgementSession {
  readonly status: Uint8Array;
  readonly stats: SessionStats = {
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    combo: 0,
    maxCombo: 0,
    early: 0,
    late: 0,
    deltas: [],
  };
  cursor = 0;
  readonly notes: Note[];
  readonly speed: number;
  constructor(notes: Note[], speed = 1) {
    this.notes = notes;
    this.speed = speed;
    this.status = new Uint8Array(notes.length);
  }
  advance(time: number) {
    const s = this.stats;
    let missed = 0;
    while (
      this.cursor < this.notes.length &&
      this.notes[this.cursor].time < time - WINDOWS.good * this.speed
    ) {
      if (!this.status[this.cursor]) {
        this.status[this.cursor] = 4;
        s.miss++;
        s.combo = 0;
        missed++;
      }
      this.cursor++;
    }
    return missed;
  }
  hit(kind: string, time: number) {
    this.advance(time);
    let found = -1,
      d = Infinity;
    for (let i = Math.max(0, this.cursor - 2); i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.time > time + WINDOWS.good * this.speed) break;
      const distance = Math.abs(n.time - time);
      if (
        !this.status[i] &&
        n.kind === kind &&
        distance <= WINDOWS.good * this.speed &&
        distance < d
      ) {
        found = i;
        d = distance;
      }
    }
    if (found < 0) return null;
    const delta = (time - this.notes[found].time) / this.speed,
      grade = judge(delta) as Exclude<Grade, "miss">,
      s = this.stats;
    this.status[found] = grade === "perfect" ? 1 : grade === "great" ? 2 : 3;
    s[grade]++;
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.deltas.push(delta * 1000);
    if (delta < -0.018) s.early++;
    if (delta > 0.018) s.late++;
    return { grade, delta, index: found };
  }
  finish() {
    this.advance(Infinity);
    const s = this.stats,
      score = calculateScore(s.perfect, s.great, s.good, this.notes.length);
    return {
      ...s,
      score,
      accuracy: score / 10000,
      total: this.notes.length,
      meanOffset: s.deltas.length
        ? s.deltas.reduce((a, b) => a + b, 0) / s.deltas.length
        : 0,
    };
  }
}
export function replayChart(notes: Note[], hits: ReplayHit[], speed = 1) {
  const game = new JudgementSession(notes, speed);
  for (const [ms, kind] of hits) game.hit(HIT_KINDS[kind], ms / 1000);
  return game.finish();
}
