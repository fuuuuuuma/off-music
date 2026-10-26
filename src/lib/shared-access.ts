import { COMMUNITY_ID } from "./community.ts";
import type { Song } from "../types.ts";
type Reference = Pick<Song, "id" | "groupId">;

// Tracks the latest server catalogue so a cached selection or pending decode
// cannot reopen a withdrawn song. API authorization remains server-side.
export class SharedAccess {
  private publicIds: Set<string> | null = null;
  private ownIds = new Set<string>();
  updatePublic(songs: Pick<Song, "id">[]) {
    this.publicIds = new Set(songs.map((s) => s.id));
  }
  updateOwned(songs: Pick<Song, "id" | "visibility">[]) {
    this.ownIds = new Set(
      songs.filter((s) => s.visibility !== "deleted").map((s) => s.id),
    );
  }
  permits(song: Reference | null | undefined) {
    return (
      !song ||
      song.groupId !== COMMUNITY_ID ||
      this.publicIds === null ||
      this.publicIds.has(song.id) ||
      this.ownIds.has(song.id)
    );
  }
}
