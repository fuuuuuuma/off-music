export type HitKind = "pulse" | "edge";
export type Difficulty = "easy" | "normal" | "hard" | "expert";
export const DIFFICULTIES: { id: Difficulty; label: string; level: number }[] =
  [
    { id: "easy", label: "かんたん", level: 2 },
    { id: "normal", label: "ふつう", level: 4 },
    { id: "hard", label: "むずかしい", level: 7 },
    { id: "expert", label: "エキスパート", level: 9 },
  ];
export interface Peak {
  time: number;
  strength: number;
  bass: number;
}
export interface Analysis {
  bpm: number;
  offset: number;
  duration: number;
  peaks: Peak[];
  waveform: number[];
  energy: number[];
}
export interface Arrangement {
  density: number[];
  edgeBias: number;
  accentEvery: number;
}
export interface Note {
  id: number;
  time: number;
  kind: HitKind;
  accent: boolean;
}
export interface Song {
  id: string;
  title: string;
  artist: string;
  duration: number;
  bpm: number;
  analysis: Analysis;
  source?: string;
  blob?: Blob;
  builtin?: boolean;
  addedAt: number;
  arrangement?: Arrangement;
}
export interface Settings {
  music: number;
  effects: number;
  offset: number;
  speed: number;
  vibration: boolean;
  reducedMotion: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  music: 0.75,
  effects: 0.65,
  offset: 0,
  speed: 1,
  vibration: true,
  reducedMotion: false,
};
export type Grade = "perfect" | "great" | "good" | "miss";
export interface Result {
  id: string;
  songId: string;
  title: string;
  difficulty: Difficulty;
  score: number;
  accuracy: number;
  maxCombo: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  total: number;
  createdAt: number;
  speed: number;
  synced?: boolean;
  ownerId?: string;
}
export interface User {
  id: string;
  name: string;
  picture?: string;
}
