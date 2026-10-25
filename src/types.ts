export type HitKind = "pulse" | "snap" | "edge";
export type Difficulty = "easy" | "normal" | "hard" | "expert";
export const DIFFICULTIES: { id: Difficulty; label: string; level: number }[] =
  [
    { id: "easy", label: "かんたん", level: 2 },
    { id: "normal", label: "ふつう", level: 4 },
    { id: "hard", label: "むずかしい", level: 7 },
    { id: "expert", label: "鬼", level: 10 },
  ];
export const HIT_KINDS: HitKind[] = ["pulse", "snap", "edge"];
export const HIT_STYLE = {
  pulse: { label: "低音", symbol: "●", color: "#f47b42", key: "F / J" },
  snap: { label: "中音", symbol: "▲", color: "#23ad99", key: "G / H" },
  edge: { label: "高音", symbol: "◆", color: "#8d70e5", key: "D / K" },
};
export interface Peak {
  time: number;
  strength: number;
  bass: number;
  mid?: number;
  high?: number;
  kind?: HitKind;
  confidence?: number;
}
export interface Analysis {
  version?: number;
  bpm: number;
  offset: number;
  duration: number;
  peaks: Peak[];
  waveform: number[];
  energy: number[];
  beats?: number[];
  confidence?: number;
  tonic?: number;
  method?: string;
  tempoAlternatives?: number[];
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
  groupId?: string;
  creatorName?: string;
  hash?: string;
  canonical?: boolean;
  analysisLoaded?: boolean;
  playCount?: number;
  playerCount?: number;
  bpmOverride?: number;
}
export interface Settings {
  music: number;
  effects: number;
  offset: number;
  speed: number;
  vibration: boolean;
  reducedMotion: boolean;
  ambient?: number;
  visualOffset?: number;
  theme?: string;
  calibratedAt?: number;
  scrollSpeed?: number;
}
export const DEFAULT_SETTINGS: Settings = {
  music: 0.75,
  effects: 0.45,
  offset: 0,
  speed: 1,
  vibration: true,
  reducedMotion: false,
  ambient: 0.055,
  visualOffset: 0,
  theme: "pearl",
  scrollSpeed: 1,
};
export type Grade = "perfect" | "great" | "good" | "miss";
export type ReplayHit = [number, number];
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
  early?: number;
  late?: number;
  meanOffset?: number;
  chartVersion?: string;
  ranked?: boolean;
  groupId?: string;
  ticket?: string;
  replay?: ReplayHit[];
  xpEarned?: number;
  rankBonus?: number;
  previousLevel?: number;
  level?: number;
}
export interface User {
  id: string;
  name: string;
  picture?: string;
}
export interface Group {
  id: string;
  name: string;
  displayName: string;
  owner: boolean;
  members: number;
  inviteCode?: string;
  isCommunity?: boolean;
}
export interface Progress {
  xp: number;
  plays: number;
  uploads: number;
  maxCombo: number;
  level: number;
  title: string;
  badges: string[];
  themes: string[];
  nextLevelXp: number;
  levelStartXp: number;
  statuses?: string[];
  rankBonus?: number;
}
export interface RankingRow {
  memberId: string;
  name: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  level: number;
  xp: number;
  rank: number;
  me: boolean;
}
