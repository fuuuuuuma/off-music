import { z } from "zod";
export const difficultySchema = z.enum([
  "easy",
  "normal",
  "hard",
  "expert",
  "master",
]);
export const noteSchema = z
  .object({
    id: z.number().int().min(0).max(3000),
    time: z.number().min(0).max(600),
    kind: z.enum(["pulse", "snap", "edge"]),
    accent: z.boolean(),
    type: z.enum(["tap", "hold", "flick"]),
    lane: z.number().min(0).max(11),
    width: z.number().min(1).max(12),
    endTime: z.number().min(0).max(600).optional(),
    tick: z.number().min(0.15).max(1).optional(),
    path: z
      .array(
        z.object({
          time: z.number().min(0).max(600),
          lane: z.number().min(0).max(11),
        }),
      )
      .min(2)
      .max(8)
      .optional(),
    endFlick: z.boolean().optional(),
    direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
  })
  .refine(
    (n) =>
      n.lane + n.width <= 12 &&
      (n.type !== "hold" ||
        (!!n.endTime &&
          n.endTime > n.time + 0.2 &&
          !!n.path &&
          n.path[0].time === n.time &&
          n.path.at(-1)!.time === n.endTime &&
          n.path.every(
            (p, i) =>
              p.lane + n.width <= 12 && (!i || p.time > n.path![i - 1].time),
          ))),
    "レーン譜面が正しくありません",
  );
const peakSchema = z.object({
  time: z.number().min(0).max(600),
  strength: z.number().min(0).max(1),
  bass: z.number().min(0).max(1),
  mid: z.number().min(0).max(1).optional(),
  high: z.number().min(0).max(1).optional(),
  kind: z.enum(["pulse", "snap", "edge"]),
  confidence: z.number().min(0).max(1).optional(),
});
export const analysisSchema = z
  .object({
    version: z.literal(2),
    bpm: z.number().min(40).max(240),
    offset: z.number().min(0).max(2),
    duration: z.number().min(3).max(600),
    peaks: z.array(peakSchema).min(1).max(3000),
    waveform: z.array(z.number().min(0).max(1)).length(100),
    energy: z.array(z.number().min(0).max(1)).length(16),
    beats: z.array(z.number().min(0).max(600)).max(2400).optional(),
    confidence: z.number().min(0).max(1).optional(),
    tonic: z.number().int().min(0).max(11).optional(),
    method: z.string().max(100).optional(),
    tempoAlternatives: z.array(z.number().min(40).max(240)).max(3).optional(),
  })
  .refine(
    (a) =>
      a.peaks.every(
        (p, i) => p.time < a.duration && (!i || p.time > a.peaks[i - 1].time),
      ),
    "音の時刻が正しくありません",
  );
export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(40),
  displayName: z.string().trim().min(1).max(30),
});
export const joinSchema = z.object({
  code: z.string().trim().min(16).max(64),
  displayName: z.string().trim().min(1).max(30),
});
export const songSchema = z.object({
  title: z.string().trim().min(1).max(140),
  artist: z.string().trim().max(80),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  size: z
    .number()
    .int()
    .min(1)
    .max(20 * 1024 * 1024),
  analysis: analysisSchema,
  rightsConfirmed: z.literal(true),
});
export const startSchema = z.object({
  chartVersion: z.string().max(40).optional(),
  songId: z.string().min(1).max(100),
  title: z.string().min(1).max(140),
  duration: z.number().min(3).max(600),
  difficulty: difficultySchema,
  speed: z.union([z.literal(0.75), z.literal(1), z.literal(1.25)]),
  groupId: z.string().uuid().nullable().optional(),
  practice: z.boolean(),
  notes: z.array(noteSchema).min(1).max(3000).optional(),
});
export const replaySchema = z
  .object({
    hits: z
      .array(
        z.tuple([
          z.number().int().min(-250).max(601000),
          z.number().int().min(0).max(2147483647),
          z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
          z.number().int().min(0).max(1200),
          z.number().int().min(-500).max(1500),
        ]),
      )
      .max(30000),
  })
  .refine(
    (a) => a.hits.every((h, i) => !i || h[0] >= a.hits[i - 1][0]),
    "入力の順序が正しくありません",
  );
