import type { StageGrade } from "../types.ts";

/** Real seconds, independent of audio playback speed. Shared by UI and replay. */
export const STAGE_WINDOWS = {
  perfect: 0.08,
  great: 0.16,
  good: 0.24,
  bad: 0.32,
};
export const STAGE_LANE_PADDING = 0.85;
export const STAGE_TOUCH_TOP = 0.3;
export const STAGE_MAX_SCORE = 1_000_000;
export const STAGE_GRADES: Record<
  StageGrade,
  { ratio: number; life: number; combo: boolean }
> = {
  perfect: { ratio: 1, life: 2, combo: true },
  great: { ratio: 0.7, life: 1, combo: true },
  good: { ratio: 0.35, life: -15, combo: false },
  bad: { ratio: 0.1, life: -35, combo: false },
  miss: { ratio: 0, life: -55, combo: false },
};
