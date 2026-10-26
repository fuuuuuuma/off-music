import { beforeEach, describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import app, { hash } from "./index.ts";
import { createChart, CHART_VERSION } from "../src/lib/stage-chart.ts";
import { perfectInputs } from "../src/lib/stage-fixtures.ts";
import { replayStage } from "../src/lib/stage-session.ts";
let sql: DatabaseSync;
const messages: string[] = [];
const objects = new Map<string, ArrayBuffer>();
const db = {
  prepare(query: string) {
    let args: unknown[] = [];
    return {
      bind(...values: unknown[]) {
        args = values;
        return this;
      },
      async first() {
        return sql.prepare(query).get(...(args as never[])) || null;
      },
      async all() {
        return { results: sql.prepare(query).all(...(args as never[])) };
      },
      async run() {
        return sql.prepare(query).run(...(args as never[]));
      },
    };
  },
  async batch(statements: { run: () => Promise<unknown> }[]) {
    sql.exec("BEGIN");
    try {
      const r = [];
      for (const s of statements) r.push(await s.run());
      sql.exec("COMMIT");
      return r;
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  },
};
const env = {
  DB: db,
  APP_ORIGIN: "https://off.test",
  ROOMS: {
    idFromName: (s: string) => s,
    get: () => ({
      fetch: async (_u: string, init: any) => {
        messages.push(init.body);
        return new Response("ok");
      },
    }),
  },
  MEDIA: {
    put: async (k: string, b: ArrayBuffer) => objects.set(k, b),
    get: async (k: string) =>
      objects.has(k) ? { body: objects.get(k) } : null,
  },
} as never;
const request = (
  path: string,
  who = "alice",
  body?: unknown,
  method?: string,
) =>
  app.request(
    "https://off.test/api/me" + path,
    {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: {
        Cookie: `off_session=${who}-token`,
        "X-Off-User": who,
        Origin: "https://off.test",
        "X-Off-Music": "1",
        "Content-Type":
          body instanceof ArrayBuffer
            ? "application/octet-stream"
            : "application/json",
      },
      body:
        body === undefined
          ? undefined
          : body instanceof ArrayBuffer
            ? body
            : JSON.stringify(body),
    },
    env,
  );
beforeEach(async () => {
  sql?.close();
  sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  sql.exec(readFileSync("migrations/0002_social.sql", "utf8"));
  sql.exec(readFileSync("migrations/0003_play_index.sql", "utf8"));
  sql.exec(readFileSync("migrations/0004_community.sql", "utf8"));
  sql.exec(readFileSync("migrations/0005_discovery_totals.sql", "utf8"));
  messages.length = 0;
  objects.clear();
  for (const id of ["alice", "bob", "eve"]) {
    sql.prepare("INSERT INTO users VALUES(?,?,NULL,?)").run(id, id, Date.now());
    sql
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(await hash(id + "-token"), id, Date.now() + 3600000);
  }
});
async function group() {
  const r = await request("/groups", "alice", {
    name: "Test Stage",
    displayName: "A",
  });
  expect(r.status).toBe(200);
  return ((await r.json()) as any).group;
}
const analysis = JSON.parse(
  readFileSync("public/music/glass-circuit.json", "utf8"),
);
async function start(groupId: string, speed = 1, practice = false) {
  const r = await request("/plays", "alice", {
    chartVersion: CHART_VERSION,
    songId: "glass-circuit",
    title: "Wrong title",
    duration: analysis.duration,
    difficulty: "normal",
    speed,
    practice,
    groupId,
    notes: createChart(analysis, "normal"),
  });
  expect(r.status).toBe(200);
  return ((await r.json()) as any).ticket;
}
describe("招待グループと音源の権限", () => {
  it("招待で参加し、第三者は順位・音源・ライブへアクセスできない", async () => {
    const g = await group();
    expect((await request(`/groups/${g.id}/rankings`, "eve")).status).toBe(403);
    expect((await request(`/groups/${g.id}/live`, "eve")).status).toBe(403);
    expect(
      (await request(`/groups/${g.id}/songs/none/audio`, "eve")).status,
    ).toBe(403);
    expect(
      (
        await request("/groups/join", "bob", {
          code: g.inviteCode,
          displayName: "B",
        })
      ).status,
    ).toBe(200);
    const r = await request(`/groups/${g.id}/rankings`, "bob");
    const body = (await r.json()) as any;
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0]).not.toHaveProperty("user_id");
    expect(body.rows[0]).not.toHaveProperty("inviteCode");
  });
  it("権利チェックとハッシュが一致した音源だけを共有し、メンバー限定で取得する", async () => {
    const g = await group(),
      bytes = new Uint8Array([1, 2, 3]).buffer,
      digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
    const payload = {
      title: "Test",
      artist: "OFF",
      hash: digest,
      size: 3,
      analysis,
      rightsConfirmed: true,
    };
    expect(
      (
        await request(`/groups/${g.id}/songs`, "alice", {
          ...payload,
          rightsConfirmed: false,
        })
      ).status,
    ).toBe(400);
    const r = await request(`/groups/${g.id}/songs`, "alice", payload);
    expect(r.status).toBe(200);
    const { id } = (await r.json()) as any;
    expect(
      (
        await request(
          `/groups/${g.id}/songs/${id}/audio`,
          "alice",
          new Uint8Array([4, 5, 6]).buffer,
          "PUT",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/groups/${g.id}/songs/${id}/audio`,
          "alice",
          bytes,
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(
      (await request(`/groups/${g.id}/songs/${id}/audio`, "alice")).status,
    ).toBe(200);
    expect(
      (await request(`/groups/${g.id}/songs/${id}/audio`, "bob")).status,
    ).toBe(403);
    expect(messages.some((s) => s.includes("songs.changed"))).toBe(true);
  });
});
describe("サーバー再判定と成長の一度だけ保存", () => {
  it("クライアント申告を使わず再生記録から100万点を計算し、再送してもXPを増やさない", async () => {
    const g = await group(),
      ticket = await start(g.id),
      hits = perfectInputs(createChart(analysis, "normal"));
    expect(
      (await request(`/plays/${ticket}/finish`, "alice", { hits })).status,
    ).toBe(400);
    sql
      .prepare("UPDATE plays SET started_at=? WHERE id=?")
      .run(Date.now() - analysis.duration * 1000 - 4000, ticket);
    const r = await request(`/plays/${ticket}/finish`, "alice", {
      hits,
      score: 9e9,
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body.result.score).toBe(1000000);
    expect(body.result.title).toBe("Glass Circuit");
    expect(body.progress.xp).toBe(80);
    expect(body.progress.plays).toBe(1);
    const repeat = (await (
      await request(`/plays/${ticket}/finish`, "alice", { hits })
    ).json()) as any;
    expect(repeat.progress.xp).toBe(80);
    const rank = (await (
      await request(
        `/groups/${g.id}/rankings?song=glass-circuit&difficulty=normal`,
      )
    ).json()) as any;
    expect(rank.rows[0].score).toBe(1000000);
    expect(messages.some((s) => s.includes("leaderboard.changed"))).toBe(true);
    expect(
      (await request(`/plays/${ticket}/finish`, "bob", { hits })).status,
    ).toBe(404);
  });
  it("練習速度の結果は総合順位へ加算しない", async () => {
    const g = await group(),
      ticket = await start(g.id, 0.75);
    sql
      .prepare("UPDATE plays SET started_at=? WHERE id=?")
      .run(Date.now() - (analysis.duration / 0.75) * 1000 - 4000, ticket);
    const r = (await (
      await request(`/plays/${ticket}/finish`, "alice", { hits: [] })
    ).json()) as any;
    expect(r.result.ranked).toBe(false);
    expect(r.progress.plays).toBe(1);
    expect(sql.prepare("SELECT COUNT(*) AS n FROM leaderboard").get()?.n).toBe(
      0,
    );
  });
  it("追加XPはファイルごと1回・1日5曲まで", async () => {
    for (let i = 0; i < 7; i++)
      await request("/progress/uploads", "alice", {
        hash: String(i).padStart(64, "0"),
      });
    await request("/progress/uploads", "alice", { hash: "0".repeat(64) });
    const r = (await (await request("/progress")).json()) as any;
    expect(r.progress.xp).toBe(150);
    expect(r.progress.uploads).toBe(5);
  });
});
const community = "00000000-0000-4000-8000-000000000001";
async function publish(who = "alice", seed = 1) {
  await request("/groups", who);
  const bytes = new Uint8Array([seed, 2, 3]).buffer,
    digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
  const response = await request(`/groups/${community}/songs`, who, {
    title: "Vocal Test " + seed,
    artist: "QA",
    hash: digest,
    size: 3,
    analysis,
    rightsConfirmed: true,
  });
  expect(response.status).toBe(200);
  const { id } = (await response.json()) as any;
  expect(
    (await request(`/groups/${community}/songs/${id}/audio`, who, bytes, "PUT"))
      .status,
  ).toBe(200);
  return id;
}
async function finishPerfect(ticket: string, who = "alice") {
  sql
    .prepare("UPDATE plays SET started_at=? WHERE id=?")
    .run(Date.now() - analysis.duration * 1000 - 4000, ticket);
  const hits = perfectInputs(createChart(analysis, "normal"));
  const r = await request(`/plays/${ticket}/finish`, who, { hits });
  expect(r.status).toBe(200);
  return (await r.json()) as any;
}
describe("Codexに依存しない全ユーザー公開", () => {
  it("Aliceの公開直後からBobが同じ音源・正規解析を取得でき、カタログは軽量", async () => {
    const id = await publish();
    await request("/groups", "bob");
    const response = await request(`/groups/${community}/songs`, "bob"),
      body = (await response.json()) as any;
    const song = body.songs.find((s: any) => s.id === id);
    expect(song).toBeDefined();
    expect(song.analysisLoaded).toBe(false);
    expect(song.analysis.peaks).toHaveLength(0);
    const full = (await (
      await request(`/groups/${community}/songs/${id}/analysis`, "bob")
    ).json()) as any;
    expect(createChart(full.analysis, "normal")).toEqual(
      createChart(analysis, "normal"),
    );
    expect(
      (await request(`/groups/${community}/songs/${id}/audio`, "bob")).status,
    ).toBe(200);
    expect(
      (await request(`/groups/${community}/songs/${id}/audio`, "anonymous"))
        .status,
    ).toBe(401);
  });
  it("未解放のEXPERTをAPIでも拒否し、Lv.5で許可する", async () => {
    await request("/groups");
    const input = {
      chartVersion: CHART_VERSION,
      songId: "glass-circuit",
      title: "Test",
      duration: analysis.duration,
      difficulty: "expert",
      speed: 1,
      practice: false,
      groupId: community,
    };
    expect((await request("/plays", "alice", input)).status).toBe(403);
    sql.prepare("INSERT INTO progress VALUES(?,1280,20,0,100)").run("alice");
    expect((await request("/plays", "alice", input)).status).toBe(200);
  });
  it("遊ばれた回数は完了だけで増え、同じチケットの再送では増えない", async () => {
    await request("/groups");
    const ticket = await start(community);
    let body = (await (
      await request(`/groups/${community}/discovery`)
    ).json()) as any;
    expect(body.stats).toHaveLength(0);
    await finishPerfect(ticket);
    await finishPerfect(ticket);
    body = (await (
      await request(`/groups/${community}/discovery`)
    ).json()) as any;
    expect(body.stats[0].plays).toBe(1);
    expect(body.stats[0].players).toBe(1);
  });
  it("演奏チケットの整理後も累計プレイ数を保つ", async () => {
    await request("/groups");
    await finishPerfect(await start(community));
    sql.prepare("DELETE FROM plays WHERE user_id=?").run("alice");
    const body = (await (
      await request(`/groups/${community}/discovery`)
    ).json()) as any;
    expect(body.stats[0].plays).toBe(1);
  });
  it("3人以上の順位でボーナスを一度だけ付与する", async () => {
    await request("/groups");
    for (const [who, score] of [
      ["bob", 500000],
      ["eve", 400000],
    ] as const) {
      await request("/groups", who);
      sql
        .prepare("INSERT INTO leaderboard_v3 VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(
          community,
          "glass-circuit",
          "normal",
          who,
          CHART_VERSION,
          score,
          score / 10000,
          2,
          "test-" + who,
          Date.now() - 1000,
        );
    }
    const ticket = await start(community),
      first = await finishPerfect(ticket);
    expect(first.result.rankBonus).toBe(85);
    expect(first.progress.xp).toBe(165);
    expect(first.progress.badges).toContain("ランキング1位");
    const repeat = await finishPerfect(ticket);
    expect(repeat.progress.xp).toBe(165);
    const next = await finishPerfect(await start(community));
    expect(next.result.xpEarned).toBe(80);
    expect(next.progress.xp).toBe(245);
  });
  it("自分の記録と曲だけをリセットし、バックアップから重複なく復元する", async () => {
    const aliceSong = await publish("alice", 1),
      bobSong = await publish("bob", 4),
      ticket = await start(community);
    await finishPerfect(ticket);
    expect((await request("/reset", "alice", {})).status).toBe(200);
    const clean = (await (await request("/progress")).json()) as any;
    expect(clean.progress.xp).toBe(0);
    const backup = (await (await request("/reset")).json()) as any;
    const repeatReset = (await (
      await request("/reset", "alice", {})
    ).json()) as any;
    expect(repeatReset.backupId).toBe(backup.backup.id);
    expect(
      (await request(`/groups/${community}/songs/${aliceSong}/audio`, "bob"))
        .status,
    ).toBe(404);
    expect(
      (await request(`/groups/${community}/songs/${bobSong}/audio`, "bob"))
        .status,
    ).toBe(200);
    expect((await request("/reset/restore", "bob", {})).status).toBe(404);
    expect((await request("/reset/restore", "alice", {})).status).toBe(200);
    expect((await request("/reset/restore", "alice", {})).status).toBe(200);
    const restored = (await (await request("/progress")).json()) as any;
    expect(restored.progress.xp).toBe(80);
    expect(
      (await request(`/groups/${community}/songs/${aliceSong}/audio`, "bob"))
        .status,
    ).toBe(200);
  });
});

describe("v4操作と版の検証", () => {
  it("広げた時間と横位置の判定でサーバーも同じ得点を保存する", async () => {
    const notes = createChart(analysis, "easy");
    const first = notes.find((n) => n.type === "tap")!;
    const hits = [
      [
        Math.round((first.time + 0.28) * 1000),
        1,
        0,
        Math.round(
          (first.lane >= 0.6
            ? first.lane - 0.6
            : first.lane + first.width + 0.6) * 100,
        ),
        500,
      ],
    ] as import("../src/types.ts").StageInput[];
    const expected = replayStage(notes, hits);
    expect(expected.bad).toBe(1);
    expect(expected.score).toBeGreaterThan(0);
    const start = await request("/plays", "alice", {
      chartVersion: CHART_VERSION,
      songId: "glass-circuit",
      title: "Test",
      duration: analysis.duration,
      difficulty: "easy",
      speed: 1,
      practice: false,
    });
    expect(start.status).toBe(200);
    const { ticket } = (await start.json()) as any;
    sql
      .prepare("UPDATE plays SET started_at=? WHERE id=?")
      .run(Date.now() - analysis.duration * 1000 - 4000, ticket);
    const finished = await request(`/plays/${ticket}/finish`, "alice", {
      hits,
      score: 1000000,
    });
    expect(finished.status).toBe(200);
    const { result } = (await finished.json()) as any;
    expect(result.score).toBe(expected.score);
    expect(result.bad).toBe(expected.bad);
    expect(result.chartVersion).toBe(CHART_VERSION);
  });
  it("旧クライアントの開始を再読込案内で拒否する", async () => {
    const r = await request("/plays", "alice", {
      songId: "glass-circuit",
      title: "old",
      duration: analysis.duration,
      difficulty: "normal",
      speed: 1,
      practice: false,
    });
    expect(r.status).toBe(409);
  });
  it("MASTERはLv.8で許可し、v4の位置/動作で再判定する", async () => {
    const g = await group();
    const input = {
      chartVersion: CHART_VERSION,
      songId: "glass-circuit",
      title: "Test",
      duration: analysis.duration,
      difficulty: "master",
      speed: 1,
      practice: false,
      groupId: g.id,
    };
    expect((await request("/plays", "alice", input)).status).toBe(403);
    sql.prepare("INSERT INTO progress VALUES(?,3920,30,0,100)").run("alice");
    const r = await request("/plays", "alice", input);
    expect(r.status).toBe(200);
    const { ticket } = (await r.json()) as any;
    sql
      .prepare("UPDATE plays SET started_at=? WHERE id=?")
      .run(Date.now() - analysis.duration * 1000 - 4000, ticket);
    expect(
      (
        await request(
          `/groups/${g.id}/rankings?song=glass-circuit&difficulty=master`,
        )
      ).status,
    ).toBe(200);
    const correct = perfectInputs(createChart(analysis, "master"));
    const wrong = correct.map((e) => [e[0], e[1], e[2], 0, e[4]]);
    const finished = await request(`/plays/${ticket}/finish`, "alice", {
      hits: wrong,
      score: 1000000,
    });
    expect(finished.status).toBe(200);
    const body = (await finished.json()) as any;
    expect(body.result.score).toBeLessThan(900000);
    expect(body.result.miss).toBeGreaterThan(0);
    expect(body.result.chartVersion).toBe(CHART_VERSION);
  });
});

describe("旧方式との成績分離", () => {
  it("旧版の100万点を新方式の順位へ混ぜず、新版だけを集計する", async () => {
    const g = await group();
    const insert = sql.prepare(
      "INSERT INTO leaderboard_v3 VALUES(?,?,?,?,?,?,?,?,?,?)",
    );
    insert.run(
      g.id,
      "glass-circuit",
      "normal",
      "alice",
      "rhythm-v3.1",
      1000000,
      100,
      500,
      "legacy",
      Date.now(),
    );
    const legacy = (await (
      await request(`/groups/${g.id}/rankings`)
    ).json()) as any;
    expect(legacy.rows[0].score).toBe(0);
    const legacySong = (await (
      await request(
        `/groups/${g.id}/rankings?song=glass-circuit&difficulty=normal`,
      )
    ).json()) as any;
    expect(legacySong.rows).toHaveLength(0);
    insert.run(
      g.id,
      "glass-circuit",
      "normal",
      "alice",
      CHART_VERSION,
      123456,
      12.3456,
      3,
      "current",
      Date.now(),
    );
    const current = (await (
      await request(`/groups/${g.id}/rankings`)
    ).json()) as any;
    expect(current.rows[0].score).toBe(123456);
  });
});
