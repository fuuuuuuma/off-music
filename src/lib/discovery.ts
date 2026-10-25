import type { Result, Song } from "../types.ts";
export type SongOrder = "recommended" | "popular" | "new";
export function discover(
  songs: Song[],
  order: SongOrder,
  history: Result[],
  level: number,
  now = Date.now(),
) {
  const played = new Set(history.map((r) => r.songId));
  const score = (s: Song) => {
    const age = s.addedAt ? Math.max(0, now - s.addedAt) / 86400000 : 90,
      plays = s.playCount || 0,
      comfortable =
        level < 3
          ? s.bpm <= 145
          : level < 5
            ? s.bpm >= 95 && s.bpm <= 175
            : true;
    return (
      (!played.has(s.id) ? 4 : 0) +
      (comfortable ? 1.3 : 0) +
      Math.exp(-age / 8) * 1.6 +
      1.6 / Math.sqrt(plays + 1) +
      Math.min(1.2, Math.log1p(plays) * 0.15)
    );
  };
  return [...songs].sort((a, b) =>
    order === "popular"
      ? (b.playCount || 0) - (a.playCount || 0) || b.addedAt - a.addedAt
      : order === "new"
        ? b.addedAt - a.addedAt || a.title.localeCompare(b.title)
        : score(b) - score(a) || a.title.localeCompare(b.title),
  );
}
export function recommendationReason(
  song: Song,
  history: Result[],
  level: number,
) {
  if (!history.some((r) => r.songId === song.id)) return "まだ遊んでいない曲";
  if ((song.playCount || 0) < 5) return "新しい一曲を発見";
  if (level < 3 && song.bpm <= 145) return "ゆっくり楽しめるテンポ";
  return "もう一度チャレンジ";
}
