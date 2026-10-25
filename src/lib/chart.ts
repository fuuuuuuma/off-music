import type {
  Analysis,
  Arrangement,
  Difficulty,
  Grade,
  Note,
} from "../types.ts";
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
    div = { easy: 1, normal: 2, hard: 2, expert: 4 }[difficulty];
  const minGap = {
    easy: beat * 0.85,
    normal: beat * 0.44,
    hard: beat * 0.34,
    expert: Math.max(0.095, beat * 0.22),
  }[difficulty];
  const threshold = { easy: 0.22, normal: 0.13, hard: 0.07, expert: 0.04 }[
    difficulty
  ];
  const candidates = analysis.peaks
    .filter((p) => p.time >= 1 && p.time < analysis.duration - 0.5)
    .map((p) => {
      const grid =
        Math.round((p.time - analysis.offset) / (beat / div)) * (beat / div) +
        analysis.offset;
      return { ...p, time: Math.abs(grid - p.time) < 0.065 ? grid : p.time };
    })
    .sort((a, b) => a.time - b.time);
  const notes: Note[] = [];
  let last = -5;
  for (const p of candidates) {
    const section = Math.min(15, Math.floor((p.time / analysis.duration) * 16)),
      density = arrangement?.density[section] ?? 1;
    if (
      p.time - last < minGap / Math.max(0.65, density) ||
      p.strength < threshold / Math.max(0.65, density)
    )
      continue;
    if (
      difficulty === "easy" &&
      Math.abs(
        (p.time - analysis.offset) / beat -
          Math.round((p.time - analysis.offset) / beat),
      ) > 0.27
    )
      continue;
    const edge =
      p.bass < (arrangement?.edgeBias ?? 0.115) && notes.length % 3 !== 0;
    notes.push({
      id: notes.length,
      time: Math.round(p.time * 1000) / 1000,
      kind: edge ? "edge" : "pulse",
      accent:
        p.strength > 0.64 &&
        notes.length % (arrangement?.accentEvery ?? 4) === 0,
    });
    last = p.time;
  }
  // Sparse tonal tracks still get a playable beat, but never invent notes over silent sections.
  if (notes.length < analysis.duration * 0.45) {
    for (
      let t = analysis.offset + beat;
      t < analysis.duration - 0.5;
      t += beat * (difficulty === "easy" ? 2 : 1)
    ) {
      if (
        t < 1 ||
        analysis.energy[
          Math.min(15, Math.floor((t / analysis.duration) * 16))
        ] < 0.035 ||
        notes.some((n) => Math.abs(n.time - t) < minGap)
      )
        continue;
      notes.push({
        id: 0,
        time: Math.round(t * 1000) / 1000,
        kind: notes.length % 4 === 3 ? "edge" : "pulse",
        accent: false,
      });
    }
  }
  return notes.sort((a, b) => a.time - b.time).map((n, id) => ({ ...n, id }));
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
