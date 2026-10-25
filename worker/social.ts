import { Hono } from "hono";
import type { ContextType } from "./env.ts";
import {
  createGroupSchema,
  joinSchema,
  songSchema,
  startSchema,
  replaySchema,
} from "./social-schema.ts";
import { CHART_VERSION, createChart, replayChart } from "../src/lib/chart.ts";
import { progression, playXp } from "../src/lib/progression.ts";
import type { Analysis, Note, Result, Difficulty } from "../src/types.ts";
import playPay from "../public/music/play-pay.json";
import glassCircuit from "../public/music/glass-circuit.json";
const router = new Hono<ContextType>();
const builtins: Record<string, { title: string; analysis: Analysis }> = {
  "play-pay": { title: "Play & Pay", analysis: playPay as Analysis },
  "glass-circuit": {
    title: "Glass Circuit",
    analysis: glassCircuit as Analysis,
  },
};
async function member(c: any, id: string) {
  return c.env.DB.prepare(
    "SELECT m.*,g.name,g.owner_id,g.invite_code FROM members m JOIN groups g ON g.id=m.group_id WHERE m.group_id=? AND m.user_id=?",
  )
    .bind(id, c.get("user").id)
    .first();
}
async function progress(c: any) {
  const r = await c.env.DB.prepare("SELECT * FROM progress WHERE user_id=?")
    .bind(c.get("user").id)
    .first();
  return progression(
    r?.xp || 0,
    r?.plays || 0,
    r?.uploads || 0,
    r?.max_combo || 0,
  );
}
async function broadcast(c: any, id: string, event: Record<string, unknown>) {
  if (!c.env.ROOMS) return;
  try {
    await c.env.ROOMS.get(c.env.ROOMS.idFromName(id)).fetch(
      "https://room/broadcast",
      { method: "POST", body: JSON.stringify({ ...event, at: Date.now() }) },
    );
  } catch {
    console.warn("Ranking live notification delayed");
  }
}
async function broadcastProgress(c: any) {
  const groups = await c.env.DB.prepare(
    "SELECT group_id FROM members WHERE user_id=?",
  )
    .bind(c.get("user").id)
    .all();
  await Promise.all(
    groups.results.map((g: { group_id: string }) =>
      broadcast(c, g.group_id, { type: "leaderboard.changed" }),
    ),
  );
}
router.get("/progress", async (c) => c.json({ progress: await progress(c) }));
router.post("/progress/uploads", async (c) => {
  const input = (await c.req.json()) as { hash?: string };
  if (!/^[a-f0-9]{64}$/.test(input.hash || ""))
    return c.json({ error: "音源を確認できません" }, 400);
  const day = Date.now() - 86400000;
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO progress_events(id,user_id,kind,reference,xp,max_combo,created_at) SELECT ?,?,'upload',?,30,0,? WHERE (SELECT COUNT(*) FROM progress_events WHERE user_id=? AND kind='upload' AND created_at>?)<5",
  )
    .bind(
      crypto.randomUUID(),
      c.get("user").id,
      input.hash!,
      Date.now(),
      c.get("user").id,
      day,
    )
    .run();
  await broadcastProgress(c);
  return c.json({ progress: await progress(c) });
});
router.get("/groups", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT g.id,g.name,g.owner_id,m.display_name,(SELECT COUNT(*) FROM members WHERE group_id=g.id) AS members FROM groups g JOIN members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.created_at",
  )
    .bind(c.get("user").id)
    .all<{
      id: string;
      name: string;
      owner_id: string;
      display_name: string;
      members: number;
    }>();
  return c.json({
    groups: rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      displayName: r.display_name,
      owner: r.owner_id === c.get("user").id,
      members: r.members,
    })),
  });
});
router.post("/groups", async (c) => {
  const data = createGroupSchema.parse(await c.req.json()),
    id = crypto.randomUUID(),
    code = crypto.randomUUID().replaceAll("-", "");
  const r = await c.env.DB.prepare(
    "INSERT INTO groups(id,name,owner_id,invite_code,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM groups)<20 AND (SELECT COUNT(*) FROM groups WHERE owner_id=?)<3 RETURNING id",
  )
    .bind(id, data.name, c.get("user").id, code, Date.now(), c.get("user").id)
    .first();
  if (!r) return c.json({ error: "グループの作成上限です" }, 429);
  await c.env.DB.prepare("INSERT INTO members VALUES(?,?,?,?,?)")
    .bind(
      crypto.randomUUID(),
      id,
      c.get("user").id,
      data.displayName,
      Date.now(),
    )
    .run();
  return c.json({
    group: {
      id,
      name: data.name,
      displayName: data.displayName,
      owner: true,
      members: 1,
      inviteCode: code,
    },
  });
});
router.post("/groups/join", async (c) => {
  const data = joinSchema.parse(await c.req.json()),
    g = await c.env.DB.prepare("SELECT id,name FROM groups WHERE invite_code=?")
      .bind(data.code)
      .first<{ id: string; name: string }>();
  if (!g) return c.json({ error: "招待コードが見つかりません" }, 404);
  await c.env.DB.prepare(
    "INSERT INTO members(id,group_id,user_id,display_name,joined_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM members WHERE group_id=?)<50 ON CONFLICT(group_id,user_id) DO UPDATE SET display_name=excluded.display_name",
  )
    .bind(
      crypto.randomUUID(),
      g.id,
      c.get("user").id,
      data.displayName,
      Date.now(),
      g.id,
    )
    .run();
  if (!(await member(c, g.id)))
    return c.json({ error: "メンバー上限です" }, 429);
  await broadcast(c, g.id, { type: "members.changed" });
  return c.json({ id: g.id });
});
router.get("/groups/:id/invite", async (c) => {
  const m = await member(c, c.req.param("id"));
  if (!m) return c.json({ error: "グループに参加してください" }, 403);
  return c.json({ code: m.invite_code });
});
router.get("/groups/:id/live", async (c) => {
  if (!(await member(c, c.req.param("id"))))
    return c.json({ error: "グループに参加してください" }, 403);
  const origin = c.req.header("Origin");
  if (
    !origin ||
    ![
      new URL(c.req.url).origin,
      c.env.APP_ORIGIN,
      "http://127.0.0.1:5190",
      "http://localhost:5190",
    ].includes(origin)
  )
    return c.json({ error: "接続を許可できません" }, 403);
  return c.env.ROOMS.get(c.env.ROOMS.idFromName(c.req.param("id"))).fetch(
    c.req.raw,
  );
});
router.get("/groups/:id/songs", async (c) => {
  if (!(await member(c, c.req.param("id"))))
    return c.json({ error: "グループに参加してください" }, 403);
  const rows = await c.env.DB.prepare(
    "SELECT s.*,m.display_name FROM group_songs s JOIN members m ON m.user_id=s.creator_id AND m.group_id=s.group_id WHERE s.group_id=? AND s.status='ready' ORDER BY s.created_at DESC LIMIT 20",
  )
    .bind(c.req.param("id"))
    .all<any>();
  return c.json({
    songs: rows.results.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      analysis: JSON.parse(s.analysis),
      duration: s.duration,
      bpm: s.bpm,
      groupId: s.group_id,
      creatorName: s.display_name,
      addedAt: s.created_at,
      hash: s.content_hash,
      canonical: true,
      source: `/api/me/groups/${s.group_id}/songs/${s.id}/audio`,
    })),
  });
});
router.post("/groups/:id/songs", async (c) => {
  const groupId = c.req.param("id");
  if (!(await member(c, groupId)))
    return c.json({ error: "グループに参加してください" }, 403);
  const d = songSchema.parse(await c.req.json()),
    id = crypto.randomUUID();
  const existing = await c.env.DB.prepare(
    "SELECT id,status FROM group_songs WHERE group_id=? AND content_hash=?",
  )
    .bind(groupId, d.hash)
    .first<{ id: string; status: string }>();
  if (existing) return c.json({ id: existing.id, status: existing.status });
  const row = await c.env.DB.prepare(
    "INSERT INTO group_songs(id,group_id,creator_id,title,artist,duration,bpm,analysis,content_hash,size,media_key,status,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,'uploading',? WHERE (SELECT COUNT(*) FROM group_songs WHERE group_id=?)<20 AND COALESCE((SELECT SUM(size) FROM group_songs WHERE group_id=?),0)+?<=209715200 AND COALESCE((SELECT SUM(size) FROM group_songs),0)+?<=524288000 RETURNING id",
  )
    .bind(
      id,
      groupId,
      c.get("user").id,
      d.title,
      d.artist,
      d.analysis.duration,
      d.analysis.bpm,
      JSON.stringify(d.analysis),
      d.hash,
      d.size,
      groupId + "/" + id,
      Date.now(),
      groupId,
      groupId,
      d.size,
      d.size,
    )
    .first();
  if (!row)
    return c.json(
      { error: "共有音源の保存上限です（20曲・グループ200MB）" },
      429,
    );
  return c.json({ id, status: "uploading" });
});
router.put("/groups/:id/songs/:song/audio", async (c) => {
  const groupId = c.req.param("id");
  if (!(await member(c, groupId)))
    return c.json({ error: "グループに参加してください" }, 403);
  const s = await c.env.DB.prepare(
    "SELECT * FROM group_songs WHERE id=? AND group_id=? AND creator_id=?",
  )
    .bind(c.req.param("song"), groupId, c.get("user").id)
    .first<any>();
  if (!s) return c.json({ error: "音源が見つかりません" }, 404);
  if (s.status === "ready") return c.json({ ok: true });
  const data = await c.req.arrayBuffer();
  if (data.byteLength !== s.size)
    return c.json({ error: "ファイルサイズが一致しません" }, 400);
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== s.content_hash)
    return c.json({ error: "音源が一致しません" }, 400);
  await c.env.MEDIA.put(s.media_key, data, {
    httpMetadata: { contentType: "application/octet-stream" },
  });
  await c.env.DB.prepare("UPDATE group_songs SET status='ready' WHERE id=?")
    .bind(s.id)
    .run();
  await broadcast(c, groupId, { type: "songs.changed" });
  return c.json({ ok: true });
});
router.get("/groups/:id/songs/:song/audio", async (c) => {
  const groupId = c.req.param("id");
  if (!(await member(c, groupId)))
    return c.json({ error: "グループに参加してください" }, 403);
  const s = await c.env.DB.prepare(
    "SELECT media_key FROM group_songs WHERE id=? AND group_id=? AND status='ready'",
  )
    .bind(c.req.param("song"), groupId)
    .first<{ media_key: string }>();
  if (!s) return c.json({ error: "音源が見つかりません" }, 404);
  const object = await c.env.MEDIA.get(s.media_key);
  if (!object) return c.json({ error: "音源を読み込めません" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
router.get("/groups/:id/rankings", async (c) => {
  const groupId = c.req.param("id");
  if (!(await member(c, groupId)))
    return c.json({ error: "グループに参加してください" }, 403);
  const song = c.req.query("song"),
    difficulty = c.req.query("difficulty") || "normal";
  if (song && !["easy", "normal", "hard", "expert"].includes(difficulty))
    return c.json({ error: "難易度を確認してください" }, 400);
  const rows = song
    ? await c.env.DB.prepare(
        "SELECT m.id AS memberId,m.display_name AS name,l.score,l.accuracy,l.max_combo AS maxCombo,COALESCE(p.xp,0) AS xp,m.user_id FROM leaderboard l JOIN members m ON m.group_id=l.group_id AND m.user_id=l.user_id LEFT JOIN progress p ON p.user_id=m.user_id WHERE l.group_id=? AND l.song_id=? AND l.difficulty=? ORDER BY l.score DESC,l.max_combo DESC,l.updated_at ASC LIMIT 50",
      )
        .bind(groupId, song, difficulty)
        .all<any>()
    : await c.env.DB.prepare(
        "SELECT m.id AS memberId,m.display_name AS name,COALESCE(SUM(l.score*CASE l.difficulty WHEN 'easy' THEN .6 WHEN 'hard' THEN 1.3 WHEN 'expert' THEN 1.6 ELSE 1 END),0) AS score,COALESCE(AVG(l.accuracy),0) AS accuracy,COALESCE(MAX(l.max_combo),0) AS maxCombo,COALESCE(p.xp,0) AS xp,m.user_id FROM members m LEFT JOIN leaderboard l ON l.group_id=m.group_id AND l.user_id=m.user_id LEFT JOIN progress p ON p.user_id=m.user_id WHERE m.group_id=? GROUP BY m.user_id ORDER BY score DESC,xp DESC,m.joined_at ASC LIMIT 50",
      )
        .bind(groupId)
        .all<any>();
  return c.json({
    rows: rows.results.map((r, i) => ({
      memberId: r.memberId,
      name: r.name,
      score: Math.round(r.score),
      accuracy: r.accuracy,
      maxCombo: r.maxCombo,
      xp: r.xp,
      level: progression(r.xp).level,
      rank: i + 1,
      me: r.user_id === c.get("user").id,
    })),
    updatedAt: Date.now(),
  });
});
router.post("/plays", async (c) => {
  const d = startSchema.parse(await c.req.json()),
    group = d.groupId || null;
  if (group && !(await member(c, group)))
    return c.json({ error: "グループに参加してください" }, 403);
  let canonical = builtins[d.songId];
  if (!canonical && group) {
    const r = await c.env.DB.prepare(
      "SELECT title,analysis FROM group_songs WHERE id=? AND group_id=? AND status='ready'",
    )
      .bind(d.songId, group)
      .first<{ title: string; analysis: string }>();
    if (r) canonical = { title: r.title, analysis: JSON.parse(r.analysis) };
  }
  const practice = d.practice || !canonical || d.speed !== 1,
    notes = practice
      ? d.notes
      : canonical
        ? createChart(canonical.analysis, d.difficulty)
        : null;
  if (!notes?.length) return c.json({ error: "譜面がありません" }, 400);
  if (
    !notes.every(
      (n, i) => n.time < d.duration && (!i || n.time > notes[i - 1].time),
    )
  )
    return c.json({ error: "譜面を確認してください" }, 400);
  const id = crypto.randomUUID();
  const inserted = await c.env.DB.prepare(
    "INSERT INTO plays(id,user_id,group_id,song_id,title,difficulty,duration,speed,chart_version,notes,ranked,started_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM plays WHERE user_id=? AND started_at>?)<100 AND (SELECT COUNT(*) FROM plays WHERE started_at>?)<1000 RETURNING id",
  )
    .bind(
      id,
      c.get("user").id,
      group,
      d.songId,
      canonical?.title || d.title,
      d.difficulty,
      practice ? d.duration : canonical.analysis.duration,
      d.speed,
      CHART_VERSION,
      JSON.stringify(notes),
      !practice && !!group ? 1 : 0,
      Date.now(),
      c.get("user").id,
      Date.now() - 86400000,
      Date.now() - 86400000,
    )
    .first();
  if (!inserted)
    return c.json(
      { error: "本日のプレイ保存上限です（1人100回・全体1000回）" },
      429,
    );
  await c.env.DB.prepare("DELETE FROM plays WHERE user_id=? AND started_at<?")
    .bind(c.get("user").id, Date.now() - 7 * 86400000)
    .run();
  return c.json({ ticket: id, ranked: !practice && !!group });
});
router.post("/plays/:ticket/finish", async (c) => {
  const d = replaySchema.parse(await c.req.json());
  const p = await c.env.DB.prepare(
    "SELECT * FROM plays WHERE id=? AND user_id=?",
  )
    .bind(c.req.param("ticket"), c.get("user").id)
    .first<any>();
  if (!p) return c.json({ error: "プレイ記録が見つかりません" }, 404);
  if (p.result)
    return c.json({
      result: JSON.parse(p.result),
      progress: await progress(c),
    });
  if (p.group_id && !(await member(c, p.group_id)))
    return c.json({ error: "グループに参加してください" }, 403);
  const elapsed = (Date.now() - p.started_at) / 1000;
  if (elapsed < p.duration / p.speed - 1 || elapsed > 7200)
    return c.json(
      { error: "プレイ時間を確認できません。端末には記録を保存しました" },
      400,
    );
  if (d.hits.some((h) => h[0] > p.duration * 1000 + 250))
    return c.json({ error: "打鍵時刻を確認してください" }, 400);
  const s = replayChart(JSON.parse(p.notes) as Note[], d.hits, p.speed),
    before = await progress(c),
    xp = playXp(s.score, s.miss);
  const result: Result = {
    id: p.id,
    songId: p.song_id,
    title: p.title,
    difficulty: p.difficulty as Difficulty,
    score: s.score,
    accuracy: s.accuracy,
    maxCombo: s.maxCombo,
    perfect: s.perfect,
    great: s.great,
    good: s.good,
    miss: s.miss,
    total: s.total,
    early: s.early,
    late: s.late,
    meanOffset: s.meanOffset,
    createdAt: Date.now(),
    speed: p.speed,
    chartVersion: CHART_VERSION,
    ranked: !!p.ranked,
    groupId: p.group_id || undefined,
    synced: true,
    xpEarned: xp,
    previousLevel: before.level,
    level: progression(before.xp + xp).level,
  };
  // A single D1 batch serializes idempotent finish, progress and personal best.
  const statements = [
    c.env.DB.prepare(
      "UPDATE plays SET finished_at=?,result=?,notes='[]' WHERE id=? AND result IS NULL",
    ).bind(Date.now(), JSON.stringify(result), p.id),
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO results(id,user_id,song_id,data,created_at) VALUES(?,?,?,?,?)",
    ).bind(
      p.id,
      c.get("user").id,
      p.song_id,
      JSON.stringify(result),
      result.createdAt,
    ),
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO progress_events(id,user_id,kind,reference,xp,max_combo,created_at) VALUES(?,?,'play',?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      c.get("user").id,
      p.id,
      xp,
      s.maxCombo,
      Date.now(),
    ),
  ];
  if (p.ranked)
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO leaderboard VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(group_id,song_id,difficulty,user_id) DO UPDATE SET score=excluded.score,accuracy=excluded.accuracy,max_combo=excluded.max_combo,result_id=excluded.result_id,updated_at=excluded.updated_at WHERE excluded.score>score OR (excluded.score=score AND excluded.max_combo>max_combo)",
      ).bind(
        p.group_id,
        p.song_id,
        p.difficulty,
        c.get("user").id,
        s.score,
        s.accuracy,
        s.maxCombo,
        p.id,
        Date.now(),
      ),
    );
  await c.env.DB.batch(statements);
  await c.env.DB.prepare(
    "DELETE FROM results WHERE user_id=? AND id NOT IN (SELECT id FROM results WHERE user_id=? ORDER BY created_at DESC LIMIT 300)",
  )
    .bind(c.get("user").id, c.get("user").id)
    .run();
  await broadcastProgress(c);
  return c.json({ result, progress: await progress(c) });
});
export default router;
