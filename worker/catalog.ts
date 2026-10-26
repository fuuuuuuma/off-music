import { Hono } from "hono";
import { z } from "zod";
import type { ContextType } from "./env.ts";
import { COMMUNITY_ID } from "../src/lib/community.ts";
import { CHART_VERSION } from "../src/lib/stage-chart.ts";
import { progression } from "../src/lib/progression.ts";
import { joinCommunity } from "./community.ts";

export const visibleScore =
  "(l.song_id IN ('play-pay','glass-circuit') OR EXISTS(SELECT 1 FROM group_songs s WHERE s.id=l.song_id AND s.group_id=l.group_id AND s.status='ready'))";
export const songColumns =
  "s.*,m.display_name,json_extract(s.analysis,'$.waveform') AS waveform,json_extract(s.analysis,'$.energy') AS energy";
export function songView(s: any, owned = false) {
  const publicSong = s.group_id === COMMUNITY_ID && s.status === "ready";
  return {
    id: s.id,
    title: s.title,
    artist: s.artist,
    duration: s.duration,
    bpm: s.bpm,
    groupId: s.group_id,
    creatorName: s.display_name,
    addedAt: s.created_at,
    canonical: true,
    analysisLoaded: false,
    owned,
    visibility:
      s.status === "deleted"
        ? "deleted"
        : s.status === "private"
          ? "private"
          : publicSong
            ? "public"
            : "group",
    analysis: {
      version: 2,
      duration: s.duration,
      bpm: s.bpm,
      offset: 0,
      peaks: [],
      waveform: JSON.parse(s.waveform || "[]"),
      energy: JSON.parse(s.energy || "[]"),
    },
    source: owned
      ? `/api/me/groups/${s.group_id}/songs/${s.id}/audio`
      : `/api/catalog/songs/${s.id}/audio`,
  };
}
export async function songChanged(c: any, scopes: string[]) {
  await Promise.allSettled(
    [...new Set([...scopes, COMMUNITY_ID])].map((scope) =>
      c.env.ROOMS.get(c.env.ROOMS.idFromName(scope)).fetch(
        "https://room/broadcast",
        {
          method: "POST",
          body: JSON.stringify({ type: "songs.changed", at: Date.now() }),
        },
      ),
    ),
  );
}
export const catalog = new Hono<ContextType>();
catalog.get("/songs", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT ${songColumns} FROM group_songs s LEFT JOIN members m ON m.user_id=s.creator_id AND m.group_id=s.group_id WHERE s.group_id=? AND s.status='ready' ORDER BY s.created_at DESC LIMIT 100`,
  )
    .bind(COMMUNITY_ID)
    .all();
  return c.json({ songs: rows.results.map((s) => songView(s)) });
});
catalog.get("/songs/:song/analysis", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT analysis FROM group_songs WHERE id=? AND group_id=? AND status='ready'",
  )
    .bind(c.req.param("song"), COMMUNITY_ID)
    .first<{ analysis: string }>();
  return row
    ? c.json({ analysis: JSON.parse(row.analysis) })
    : c.json({ error: "この曲は公開されていません" }, 404);
});
catalog.get("/songs/:song/audio", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT media_key FROM group_songs WHERE id=? AND group_id=? AND status='ready'",
  )
    .bind(c.req.param("song"), COMMUNITY_ID)
    .first<{ media_key: string }>();
  if (!row) return c.json({ error: "この曲は公開されていません" }, 404);
  const object = await c.env.MEDIA.get(row.media_key);
  if (!object) return c.json({ error: "音源を読み込めません" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
catalog.get("/discovery", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT a.song_id,SUM(a.plays) AS plays,COUNT(*) AS players FROM song_activity a WHERE a.group_id=? AND (a.song_id IN ('play-pay','glass-circuit') OR EXISTS(SELECT 1 FROM group_songs s WHERE s.id=a.song_id AND s.group_id=a.group_id AND s.status='ready')) GROUP BY a.song_id",
  )
    .bind(COMMUNITY_ID)
    .all();
  return c.json({ stats: rows.results });
});
catalog.get("/rankings", async (c) => {
  const song = c.req.query("song"),
    difficulty = c.req.query("difficulty") || "normal";
  if (!["easy", "normal", "hard", "expert", "master"].includes(difficulty))
    return c.json({ error: "難易度を確認してください" }, 400);
  const rows = song
    ? await c.env.DB.prepare(
        `SELECT m.id AS memberId,m.display_name AS name,l.score,l.accuracy,l.max_combo AS maxCombo,COALESCE(p.xp,0) AS xp FROM leaderboard_v3 l JOIN members m ON m.group_id=l.group_id AND m.user_id=l.user_id LEFT JOIN progress p ON p.user_id=l.user_id WHERE l.chart_version=? AND l.group_id=? AND l.song_id=? AND l.difficulty=? AND ${visibleScore} ORDER BY l.score DESC,l.max_combo DESC,l.updated_at ASC LIMIT 50`,
      )
        .bind(CHART_VERSION, COMMUNITY_ID, song, difficulty)
        .all<any>()
    : await c.env.DB.prepare(
        `SELECT m.id AS memberId,m.display_name AS name,SUM(l.score*CASE l.difficulty WHEN 'easy' THEN .6 WHEN 'hard' THEN 1.3 WHEN 'expert' THEN 1.6 WHEN 'master' THEN 1.8 ELSE 1 END) AS score,AVG(l.accuracy) AS accuracy,MAX(l.max_combo) AS maxCombo,COALESCE(p.xp,0) AS xp FROM leaderboard_v3 l JOIN members m ON m.group_id=l.group_id AND m.user_id=l.user_id LEFT JOIN progress p ON p.user_id=l.user_id WHERE l.chart_version=? AND l.group_id=? AND ${visibleScore} GROUP BY l.user_id ORDER BY score DESC,l.user_id ASC LIMIT 50`,
      )
        .bind(CHART_VERSION, COMMUNITY_ID)
        .all<any>();
  return c.json({
    rows: rows.results.map((r, i) => ({
      ...r,
      score: Math.round(r.score),
      level: progression(r.xp).level,
      rank: i + 1,
      me: false,
    })),
    updatedAt: Date.now(),
  });
});
catalog.get("/live", async (c) => {
  const origin = c.req.header("Origin");
  if (
    !origin ||
    ![
      new URL(c.req.url).origin,
      c.env.APP_ORIGIN,
      "http://localhost:5190",
      "http://127.0.0.1:5190",
    ].includes(origin)
  )
    return c.json({ error: "接続を許可できません" }, 403);
  return c.env.ROOMS.get(c.env.ROOMS.idFromName(COMMUNITY_ID)).fetch(c.req.raw);
});

export const songManagement = new Hono<ContextType>();
songManagement.get("/songs", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT ${songColumns} FROM group_songs s LEFT JOIN members m ON m.user_id=s.creator_id AND m.group_id=s.group_id WHERE s.creator_id=? AND s.status IN ('ready','private','deleted') ORDER BY s.created_at DESC LIMIT 200`,
  )
    .bind(c.get("user").id)
    .all();
  return c.json({ songs: rows.results.map((s) => songView(s, true)) });
});
songManagement.patch("/songs/:song", async (c) => {
  const d = z
    .object({
      visibility: z.enum(["public", "private"]),
      rightsConfirmed: z.boolean().optional(),
    })
    .parse(await c.req.json());
  const user = c.get("user").id;
  const row = await c.env.DB.prepare(
    "SELECT * FROM group_songs WHERE id=? AND creator_id=? AND status IN ('ready','private')",
  )
    .bind(c.req.param("song"), user)
    .first<any>();
  if (!row) return c.json({ error: "管理できる曲が見つかりません" }, 404);
  if (d.visibility === "public") {
    if (!d.rightsConfirmed)
      return c.json(
        { error: "サイト利用者全員への配信・再配布の権利を確認してください" },
        400,
      );
    await joinCommunity(c.env.DB, user);
    const duplicate = await c.env.DB.prepare(
      "SELECT id FROM group_songs WHERE group_id=? AND content_hash=? AND id!=?",
    )
      .bind(COMMUNITY_ID, row.content_hash, row.id)
      .first();
    if (duplicate)
      return c.json({ error: "同じ音源がすでに登録されています" }, 400);
  }
  if (d.visibility === "public" && row.group_id !== COMMUNITY_ID) {
    const quota = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count,COALESCE(SUM(size),0) AS size FROM group_songs WHERE group_id=?",
    )
      .bind(COMMUNITY_ID)
      .first<{ count: number; size: number }>();
    if (quota && (quota.count >= 100 || quota.size + row.size > 209715200))
      return c.json({ error: "公開曲の保存上限に達しました" }, 429);
  }
  const scope = d.visibility === "public" ? COMMUNITY_ID : row.group_id;
  const result = await c.env.DB.prepare(
    "UPDATE group_songs SET status=?,group_id=? WHERE id=? AND creator_id=? AND status IN ('ready','private') RETURNING id",
  )
    .bind(d.visibility === "public" ? "ready" : "private", scope, row.id, user)
    .first();
  if (!result)
    return c.json({ error: "曲の状態が変わりました。更新してください" }, 400);
  await songChanged(c, [row.group_id, scope]);
  return c.json({ ok: true });
});
songManagement.delete("/songs/:song", async (c) => {
  const row = await c.env.DB.prepare(
    "UPDATE group_songs SET status='deleted' WHERE id=? AND creator_id=? AND status IN ('ready','private','deleted') RETURNING group_id",
  )
    .bind(c.req.param("song"), c.get("user").id)
    .first<{ group_id: string }>();
  if (!row) return c.json({ error: "管理できる曲が見つかりません" }, 404);
  await songChanged(c, [row.group_id]);
  return c.json({ ok: true });
});
songManagement.post("/songs/:song/restore", async (c) => {
  const row = await c.env.DB.prepare(
    "UPDATE group_songs SET status='private' WHERE id=? AND creator_id=? AND status='deleted' RETURNING group_id",
  )
    .bind(c.req.param("song"), c.get("user").id)
    .first<{ group_id: string }>();
  if (!row) return c.json({ error: "復元できる曲が見つかりません" }, 404);
  await songChanged(c, [row.group_id]);
  return c.json({ ok: true });
});
