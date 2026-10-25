import { travelSeconds } from "./motion.ts";
export function stageGeometry(width: number, height: number) {
  return {
    width,
    height,
    top: height * 0.045,
    line: height * 0.8,
    far: width * 0.16,
    near: width * 0.88,
  };
}
export function projectLane(
  lane: number,
  progress: number,
  width: number,
  height: number,
) {
  const g = stageGeometry(width, height),
    p = Math.max(-0.1, Math.min(1.12, progress));
  const z = (1 / (1 + 3 * (1 - p)) - 0.25) / 0.75;
  return {
    x: width / 2 + (lane / 12 - 0.5) * (g.far + (g.near - g.far) * z),
    y: g.top + (g.line - g.top) * z,
    scale: 0.15 + 0.85 * z,
  };
}
export function stageProgress(
  noteTime: number,
  songTime: number,
  bpm: number,
  scroll = 1,
) {
  return 1 - (noteTime - songTime) / travelSeconds(bpm, scroll);
}
export function touchLane(x: number, width: number) {
  return Math.max(
    0,
    Math.min(12, ((x - width / 2) / (width * 0.88) + 0.5) * 12),
  );
}
