import { beforeEach, describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import app, { hash } from "./index.ts";
import { createChart } from "../src/lib/chart.ts";
import { HIT_KINDS } from "../src/types.ts";
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
      hits = createChart(analysis, "normal").map((n) => [
        Math.round(n.time * 1000),
        HIT_KINDS.indexOf(n.kind),
      ]);
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
