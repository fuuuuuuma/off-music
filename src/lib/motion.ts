/** Distances are measured in source-song seconds. Playback speed is applied only by MusicClock. */
export function travelSeconds(bpm: number, scroll = 1) {
  return (
    (4 * 60) /
    Math.max(40, Math.min(240, bpm || 120)) /
    Math.max(0.6, Math.min(2, scroll))
  );
}
export function noteX(
  noteTime: number,
  songTime: number,
  width: number,
  bpm: number,
  scroll = 1,
) {
  const line = width * 0.16;
  return (
    line +
    ((noteTime - songTime) / travelSeconds(bpm, scroll)) * (width - line - 25)
  );
}
export function effectiveBpm(bpm: number, playback = 1) {
  return Math.round(bpm * playback * 10) / 10;
}
