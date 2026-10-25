import { COMMUNITY_ID } from "../src/lib/community.ts";
export async function joinCommunity(db: D1Database, userId: string) {
  await db
    .prepare(
      "INSERT OR IGNORE INTO members(id,group_id,user_id,display_name,joined_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM groups WHERE id=?)",
    )
    .bind(
      crypto.randomUUID(),
      COMMUNITY_ID,
      userId,
      "Player " + crypto.randomUUID().slice(0, 6),
      Date.now(),
      COMMUNITY_ID,
    )
    .run();
}
