import { createChart as attacks } from "./chart.ts";
import type { Analysis, Arrangement, Difficulty, StageNote } from "../types.ts";
export const CHART_VERSION = "lanes-v4.0";
export const LANES = 12;
export const KEYS = ["A", "S", "D", "J", "K", "L"];
export const NOTE_STYLE = {
  tap: { label: "タップ", symbol: "▬", color: "#168fba" },
  hold: { label: "スライド", symbol: "〰", color: "#13a888" },
  flick: { label: "フリック", symbol: "↑", color: "#d84c93" },
};
export function createChart(
  a: Analysis,
  difficulty: Difficulty,
  arrangement?: Arrangement,
  bpmOverride?: number,
): StageNote[] {
  const source = attacks(a, difficulty, arrangement, bpmOverride).slice(
    0,
    2200,
  );
  const beat = 60 / (bpmOverride || a.bpm);
  const rank = ["easy", "normal", "hard", "expert", "master"].indexOf(
    difficulty,
  );
  const notes: StageNote[] = [];
  let occupied: { end: number; side: number } | null = null;
  let lastChord = -10;
  const pattern = [1, 4, 2, 5, 3, 0, 4, 1];
  for (let i = 0; i < source.length; i++) {
    const s = source[i];
    if (occupied && occupied.end + 0.18 < s.time) occupied = null;
    const side: number = occupied ? 1 - occupied.side : i % 2;
    const width =
      rank === 0
        ? 4
        : rank === 1
          ? 3
          : rank === 2
            ? i % 3
              ? 3
              : 2
            : rank === 3
              ? 2
              : i % 4
                ? 2
                : 1.5;
    const lane =
      side * 6 +
      Math.min(
        6 - width,
        (pattern[Math.floor(i / 2) % pattern.length] * (6 - width)) / 5,
      );
    const n: StageNote = {
      ...s,
      type: "tap",
      lane,
      width,
      accent: s.accent && i % 7 === 0,
    };
    const holdEvery = rank === 0 ? 17 : rank < 3 ? 13 : 10;
    if (!occupied && i % holdEvery === 5 && s.kind !== "edge") {
      const target = source
        .slice(i + 1, i + 28)
        .find(
          (p) =>
            p.time >= s.time + beat * 1.5 &&
            p.time <= s.time + beat * 3.2 &&
            p.time < a.duration - 0.4,
        );
      if (target) {
        n.type = "hold";
        n.endTime = target.time;
        n.tick = beat / 2;
        const drift =
          rank < 2 ? 0 : (side === 0 ? 1 : -1) * Math.min(rank - 1, 6 - width);
        const to = Math.max(
          side * 6,
          Math.min(side * 6 + 6 - width, lane + drift),
        );
        n.path = [
          { time: s.time, lane },
          { time: s.time + (target.time - s.time) * 0.5, lane: to },
          { time: target.time, lane: rank >= 3 ? lane : to },
        ];
        n.endFlick = rank >= 3 && i % 3 === 0;
        n.direction = 0;
        occupied = { end: target.time, side };
      }
    } else if (
      rank >= 1 &&
      (i % (rank < 3 ? 11 : 7) === 3 ||
        (rank >= 3 && s.kind === "edge" && i % 4 === 0))
    ) {
      n.type = "flick";
      n.direction = rank >= 2 ? (side === 0 ? -1 : 1) : 0;
    }
    notes.push(n);
    if (
      rank >= 1 &&
      !occupied &&
      s.accent &&
      i % (rank >= 3 ? 8 : 14) === 0 &&
      s.time - lastChord > beat
    ) {
      notes.push({
        ...n,
        lane: 12 - lane - width,
        type: rank >= 3 && i % 16 === 0 ? "flick" : "tap",
        direction: side === 0 ? 1 : -1,
      });
      lastChord = s.time;
    }
  }
  return notes
    .sort((x, y) => x.time - y.time || x.lane - y.lane)
    .map((n, id) => ({ ...n, id }));
}
export function laneAt(n: StageNote, time: number) {
  if (!n.path?.length) return n.lane;
  for (let i = 1; i < n.path.length; i++) {
    const a = n.path[i - 1],
      b = n.path[i];
    if (time <= b.time) {
      const t = Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
      const smooth = t * t * (3 - 2 * t);
      return a.lane + (b.lane - a.lane) * smooth;
    }
  }
  return n.path.at(-1)!.lane;
}
export function stagePoints(notes: StageNote[]) {
  return notes
    .flatMap((n, index) => {
      const result = [
        {
          note: index,
          time: n.time,
          type: n.type === "flick" ? "flick" : "head",
        },
      ];
      if (n.type === "hold" && n.endTime) {
        const tick = Math.max(0.15, n.tick || 0.25);
        for (let t = n.time + tick; t < n.endTime - 0.09; t += tick)
          result.push({
            note: index,
            time: Math.round(t * 10000) / 10000,
            type: "tick",
          });
        result.push({
          note: index,
          time: n.endTime,
          type: n.endFlick ? "flickTail" : "tail",
        });
      }
      return result;
    })
    .sort((a, b) => a.time - b.time || a.note - b.note);
}
