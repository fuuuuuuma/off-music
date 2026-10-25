import { z } from "zod";
export const settingsSchema = z.object({
  music: z.number().min(0).max(1),
  effects: z.number().min(0).max(1),
  offset: z.number().int().min(-250).max(250),
  speed: z.union([z.literal(0.75), z.literal(1), z.literal(1.25)]),
  vibration: z.boolean(),
  reducedMotion: z.boolean(),
  ambient: z.number().min(0).max(0.2).optional(),
  visualOffset: z.number().int().min(-250).max(250).optional(),
  theme: z.enum(["pearl", "sunset", "neon", "aurora"]).optional(),
  calibratedAt: z.number().int().optional(),
});
export const resultSchema = z
  .object({
    id: z.string().uuid(),
    songId: z.string().min(1).max(100),
    title: z.string().min(1).max(140),
    difficulty: z.enum(["easy", "normal", "hard", "expert"]),
    perfect: z.number().int().min(0).max(10000),
    great: z.number().int().min(0).max(10000),
    good: z.number().int().min(0).max(10000),
    miss: z.number().int().min(0).max(10000),
    maxCombo: z.number().int().min(0).max(10000),
    total: z.number().int().min(1).max(10000),
    createdAt: z.number().int().min(0),
    speed: z.union([z.literal(0.75), z.literal(1), z.literal(1.25)]),
  })
  .refine(
    (v) =>
      v.perfect + v.great + v.good + v.miss === v.total &&
      v.maxCombo <= v.total - v.miss,
    "集計が一致しません",
  );
export const arrangeSchema = z.object({
  bpm: z.number().min(40).max(240),
  duration: z.number().min(3).max(600),
  energy: z.array(z.number().min(0).max(1)).length(16),
  style: z.enum(["balanced", "flow", "challenge"]),
});
export const arrangementSchema = z.object({
  density: z.array(z.number().min(0.65).max(1.4)).length(16),
  edgeBias: z.number().min(0.06).max(0.22),
  accentEvery: z.number().int().min(2).max(8),
});
