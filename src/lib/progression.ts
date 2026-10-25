import type { Progress } from "../types.ts";
export const THEMES = [
  { id: "pearl", label: "パール", level: 1 },
  { id: "sunset", label: "サンセット", level: 3 },
  { id: "neon", label: "ネオン", level: 5 },
  { id: "aurora", label: "オーロラ", level: 8 },
];
export function progression(
  xp = 0,
  plays = 0,
  uploads = 0,
  maxCombo = 0,
): Progress {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 80)) + 1;
  const badges: string[] = [];
  if (plays >= 1) badges.push("初セッション");
  if (plays >= 10) badges.push("セッション職人");
  if (plays >= 30) badges.push("リズムの達人");
  if (uploads >= 1) badges.push("選曲家");
  if (uploads >= 3) badges.push("キュレーター");
  if (maxCombo >= 25) badges.push("25コンボ");
  if (maxCombo >= 50) badges.push("50コンボ");
  if (maxCombo >= 100) badges.push("100コンボ");
  return {
    xp,
    plays,
    uploads,
    maxCombo,
    level,
    title:
      level >= 10
        ? "ステージマスター"
        : level >= 7
          ? "ビートスター"
          : level >= 5
            ? "リズムメーカー"
            : level >= 3
              ? "セッションプレイヤー"
              : "ルーキー",
    badges,
    themes: THEMES.filter((t) => level >= t.level).map((t) => t.id),
    nextLevelXp: 80 * level * level,
    levelStartXp: 80 * (level - 1) ** 2,
  };
}
export function playXp(score: number, miss: number) {
  return (
    20 +
    Math.round((Math.max(0, Math.min(1000000, score)) / 1000000) * 40) +
    (miss === 0 ? 20 : 0)
  );
}
