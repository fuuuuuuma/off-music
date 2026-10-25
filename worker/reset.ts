import { Hono } from "hono";
import type { ContextType } from "./env.ts";
const router = new Hono<ContextType>();
async function broadcast(c: import("hono").Context<ContextType>, user: string) {
  const groups = await c.env.DB.prepare("SELECT group_id FROM members WHERE user_id=?").bind(user).all<{group_id:string}>();
  await Promise.allSettled(groups.results.map(g=>c.env.ROOMS.get(c.env.ROOMS.idFromName(g.group_id)).fetch("https://room/broadcast",{method:"POST",body:JSON.stringify({type:"songs.changed",at:Date.now()})})));
}
const tables = {
  song_activity: "group_id,song_id,user_id,plays,last_played_at",
  results: "id,user_id,song_id,data,created_at",
  plays:
    "id,user_id,group_id,song_id,title,difficulty,duration,speed,chart_version,notes,ranked,started_at,finished_at,result",
  progress_events: "id,user_id,kind,reference,xp,max_combo,created_at",
  progress: "user_id,xp,plays,uploads,max_combo",
  leaderboard:
    "group_id,song_id,difficulty,user_id,score,accuracy,max_combo,result_id,updated_at",
  leaderboard_v3:
    "group_id,song_id,difficulty,user_id,chart_version,score,accuracy,max_combo,result_id,updated_at",
  group_songs:
    "id,group_id,creator_id,title,artist,duration,bpm,analysis,content_hash,size,media_key,status,created_at",
};
router.post("/reset", async (c) => {
  const user = c.get("user").id,
    id = crypto.randomUUID(),
    createdAt=Date.now();
  const latest = await c.env.DB.prepare("SELECT id,created_at FROM reset_backups WHERE user_id=? ORDER BY created_at DESC LIMIT 1").bind(user).first<{id:string;created_at:number}>();
  const active = await c.env.DB.prepare("SELECT (SELECT COUNT(*) FROM results WHERE user_id=?)+(SELECT COUNT(*) FROM progress_events WHERE user_id=?)+(SELECT COUNT(*) FROM group_songs WHERE creator_id=? AND status!='archived') AS n").bind(user,user,user).first<{n:number}>();
  if(latest && !active?.n) return c.json({ok:true,backupId:latest.id,createdAt:latest.created_at});
  const statements = [
    c.env.DB.prepare("INSERT INTO reset_backups VALUES(?,?,?,?)").bind(
      id,
      user,
      createdAt,
      JSON.stringify({ version: 3 }),
    ),
  ];
  for (const [table, columns] of Object.entries(tables)) {
    const json = columns
        .split(",")
        .map((col) => `'${col}',${col}`)
        .join(","),
      key = columns.startsWith("id,")
        ? "id"
        : table === "leaderboard_v3"
          ? "group_id||':'||song_id||':'||difficulty||':'||chart_version"
          : table === "song_activity" ? "group_id||':'||song_id"
          : table.startsWith("leaderboard")
            ? "group_id||':'||song_id||':'||difficulty"
            : "user_id";
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO reset_backup_items SELECT ?,'${table}',${key},json_object(${json}) FROM ${table} WHERE ${table === "group_songs" ? "creator_id" : "user_id"}=?`,
      ).bind(id, user),
    );
  }
  await c.env.DB.batch(statements);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE group_songs SET status='archived' WHERE creator_id=?",
    ).bind(user),
    ...[
      "results",
      "plays",
      "leaderboard",
      "leaderboard_v3",
      "progress_events",
      "progress",
      "song_activity",
    ].map((t) =>
      c.env.DB.prepare(`DELETE FROM ${t} WHERE user_id=?`).bind(user),
    ),
    c.env.DB.prepare(
      "UPDATE preferences SET data=json_set(data,'$.theme','pearl') WHERE user_id=?",
    ).bind(user),
  ]);
  await broadcast(c,user);
  return c.json({ ok: true, backupId: id,createdAt });
});
router.get("/reset", async (c) => {
  const backup = await c.env.DB.prepare(
    "SELECT id,created_at FROM reset_backups WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(c.get("user").id)
    .first();
  return c.json({ backup });
});
router.post("/reset/restore", async (c) => {
  const user = c.get("user").id,
    b = await c.env.DB.prepare(
      "SELECT id FROM reset_backups WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(user)
      .first<{ id: string }>();
  if (!b) return c.json({ error: "復元できるリセットがありません" }, 404);
  const statements = [
    c.env.DB.prepare(
      "UPDATE group_songs SET status=COALESCE((SELECT json_extract(data,'$.status') FROM reset_backup_items WHERE reset_id=? AND table_name='group_songs' AND row_id=group_songs.id),'ready') WHERE creator_id=? AND id IN (SELECT row_id FROM reset_backup_items WHERE reset_id=? AND table_name='group_songs')",
    ).bind(b.id, user, b.id),
  ];
  for (const table of [
    "progress_events",
    "song_activity",
    "results",
    "plays",
    "leaderboard",
    "leaderboard_v3",
  ] as const) {
    const columns = tables[table],
      values = columns
        .split(",")
        .map((col) => `json_extract(data,'$.${col}')`)
        .join(",");
    statements.push(
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO ${table}(${columns}) SELECT ${values} FROM reset_backup_items WHERE reset_id=? AND table_name=?`,
      ).bind(b.id, table),
    );
  }
  await c.env.DB.batch(statements);
  await broadcast(c,user);
  return c.json({ ok: true });
});
export default router;
