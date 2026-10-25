import type { Progress } from "../types.ts";
export const THEMES = [
  { id: "pearl", label: "パール", level: 1 },
  { id: "sunset", label: "サンセット", level: 3 },
  { id: "neon", label: "ネオン", level: 5 },
  { id: "aurora", label: "オーロラ", level: 8 },
];
export const EXPERT_LEVEL = 5;
export function difficultyLevel(difficulty: string) {
  return difficulty === "master" ? 8 : difficulty === "expert" ? 5 : 1;
}
export const UNLOCKS = [
  {
    level: 2,
    label: "グラスフレーム",
    detail: "プロフィールとレベル表示が変化",
  },
  {
    level: 3,
    label: "サンセット・音楽好き",
    detail: "テーマとステータスを解放",
  },
  { level: 5, label: "EXPERT・ネオン", detail: "高難易度と新テーマを解放" },
  {
    level: 8,
    label: "MASTER・オーロラ",
    detail: "最高難易度と特別なコンボ演出",
  },
  { level: 10, label: "ステージマスター", detail: "マスターステータスを獲得" },
];
export function difficultyUnlocked(level: number, difficulty: string) {
  return level >= difficultyLevel(difficulty);
}
export function progression(
  xp = 0,
  plays = 0,
  uploads = 0,
  maxCombo = 0,
  achievements: string[] = [],
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
  if (achievements.includes("rank:first")) badges.push("ランキング1位");
  if (achievements.includes("rank:podium")) badges.push("表彰台");
  const statuses: string[] = [];
  if (plays >= 5 || level >= 3) statuses.push("音楽好き");
  if (uploads >= 1) statuses.push("選曲家");
  if (plays >= 10) statuses.push("リズムラバー");
  if (maxCombo >= 50) statuses.push("コンボメーカー");
  if (level >= 10) statuses.push("ステージマスター");
  return {
    statuses,
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
