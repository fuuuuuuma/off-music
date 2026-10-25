import { openDB } from "idb";
import type { Result, Settings, Song, Progress } from "../types.ts";
const db = openDB("off-music", 1, {
  upgrade(db) {
    db.createObjectStore("songs", { keyPath: "id" });
    db.createObjectStore("results", { keyPath: "id" });
    db.createObjectStore("settings");
  },
});
export const store = {
  guestUploads: async (): Promise<string[]> =>
    (await db).get("settings", "guest-uploads").then((v) => v || []),
  saveGuestUploads: async (hashes: string[]) =>
    (await db).put("settings", hashes, "guest-uploads"),
  guestProgress: async (): Promise<Progress | undefined> =>
    (await db).get("settings", "guest-progress"),
  saveGuestProgress: async (p: Progress) =>
    (await db).put("settings", p, "guest-progress"),
  songs: async (): Promise<Song[]> => (await db).getAll("songs"),
  saveSong: async (song: Song) => (await db).put("songs", song),
  deleteSong: async (id: string) => (await db).delete("songs", id),
  results: async (): Promise<Result[]> => (await db).getAll("results"),
  saveResult: async (result: Result) => (await db).put("results", result),
  settings: async (): Promise<Settings | undefined> =>
    (await db).get("settings", "main"),
  saveSettings: async (settings: Settings) =>
    (await db).put("settings", settings, "main"),
};
