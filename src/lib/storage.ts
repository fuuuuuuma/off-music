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
  seenReset:async(userId:string):Promise<number> => (await db).get('settings','seen-reset:'+userId).then(v=>v||0),
  markReset:async(userId:string,at:number)=>(await db).put('settings',at,'seen-reset:'+userId),
  reset: async (userId: string) => {
    const d = await db;
    const snapshot = {
      userId,
      songs: await d.getAll("songs"),
      results: (await d.getAll("results")).filter((r) => r.ownerId === userId),
      guest: await d.get("settings", "guest-progress"),
    };
    if(snapshot.songs.length || snapshot.results.length || snapshot.guest || !(await d.get("settings","reset-backup"))) await d.put("settings", snapshot, "reset-backup");
    const tx = d.transaction(["songs", "results", "settings"], "readwrite");
    await tx.objectStore("songs").clear();
    for (const result of snapshot.results)
      await tx.objectStore("results").delete(result.id);
    await tx.objectStore("settings").delete("guest-progress");
    await tx.objectStore("settings").delete("guest-uploads");
    await tx.done;
  },
  restoreReset: async (userId: string) => {
    const d = await db,
      snapshot = await d.get("settings", "reset-backup");
    if (!snapshot || snapshot.userId !== userId) return;
    const tx = d.transaction(["songs", "results", "settings"], "readwrite");
    for (const song of snapshot.songs) await tx.objectStore("songs").put(song);
    for (const result of snapshot.results)
      await tx.objectStore("results").put(result);
    if (snapshot.guest)
      await tx.objectStore("settings").put(snapshot.guest, "guest-progress");
    await tx.done;
  },
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
