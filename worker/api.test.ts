import { beforeEach, describe, it, expect, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import app, { hash } from "./index.ts";
// Real SQLite schema behind a D1-compatible adapter. Google/AI service calls are not claimed as live tests here.
let sqlite: DatabaseSync;
const db = {
  prepare(sql: string) {
    const run = (args: unknown[]) => sqlite.prepare(sql);
    let values: unknown[] = [];
    return {
      bind(...args: unknown[]) {
        values = args;
        return this;
      },
      async first() {
        return run(values).get(...(values as never[])) || null;
      },
      async all() {
        return { results: run(values).all(...(values as never[])) };
      },
      async run() {
        return run(values).run(...(values as never[]));
      },
    };
  },
};
const ai = vi.fn(async (): Promise<{ response: unknown }> => ({
  response: JSON.stringify({
    density: Array(16).fill(1.1),
    edgeBias: 0.13,
    accentEvery: 4,
  }),
}));
const env = {
  DB: db,
  AI: { run: ai },
  GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com",
  AI_MODEL: "unit-test",
  APP_ORIGIN: "https://off.example",
} as never;
const origin = "https://off.example";
const request = (
  path: string,
  token?: string,
  body?: unknown,
  customOrigin = origin,
) =>
  app.request(
    origin + "/api" + path,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(token
          ? {
              Cookie: "off_session=" + token,
              "X-Off-User": token.split("-")[0],
            }
          : {}),
        ...(body !== undefined
          ? {
              "Content-Type": "application/json",
              "X-Off-Music": "1",
              Origin: customOrigin,
            }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
beforeEach(async () => {
  sqlite?.close();
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  for (const name of ["alice", "bob"]) {
    sqlite
      .prepare("INSERT INTO users VALUES(?,?,NULL,?)")
      .run(name, name, Date.now());
    sqlite
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(await hash(name + "-token"), name, Date.now() + 100000);
  }
  ai.mockClear();
});
const result = {
  id: "45826aab-5763-4b3a-8c02-bec74438b166",
  songId: "make-something",
  title: "MAKE SOMETHING.",
  difficulty: "normal",
  perfect: 7,
  great: 1,
  good: 1,
  miss: 1,
  maxCombo: 5,
  total: 10,
  createdAt: Date.now(),
  speed: 1,
  score: 999999999,
  accuracy: 999,
};
describe("認証と本人だけの保存", () => {
  it("未認証の保護APIを拒否する", async () => {
    expect((await request("/me/results")).status).toBe(401);
    expect((await request("/me/arrange", undefined, {})).status).toBe(401);
  });
  it("別のオリジンからの変更を拒否する", async () =>
    expect(
      (
        await request(
          "/me/results",
          "alice-token",
          result,
          "https://evil.example",
        )
      ).status,
    ).toBe(403));
  it("別タブでユーザーが変わると保存を拒否する", async () => {
    const res = await app.request(
      origin + "/api/me/results",
      {
        method: "POST",
        headers: {
          Cookie: "off_session=bob-token",
          "Content-Type": "application/json",
          "X-Off-Music": "1",
          "X-Off-User": "alice",
          Origin: origin,
        },
        body: JSON.stringify(result),
      },
      env,
    );
    expect(res.status).toBe(409);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM results").get()?.n).toBe(
      0,
    );
  });
  it("サーバーが集計し、クライアントの得点を信じない", async () => {
    expect((await request("/me/results", "alice-token", result)).status).toBe(
      200,
    );
    const data = (await (
      await request("/me/results", "alice-token")
    ).json()) as { results: { score: number; accuracy: number }[] };
    expect(data.results[0].score).toBe(805000);
    expect(data.results[0].accuracy).toBe(80.5);
  });
  it("ユーザーAの結果はBから見えず、同じUUIDのBの保存でもAを書き換えない", async () => {
    await request("/me/results", "alice-token", result);
    expect(await (await request("/me/results", "bob-token")).json()).toEqual({
      results: [],
    });
    await request("/me/results", "bob-token", { ...result, title: "Bの曲" });
    const a = (await (await request("/me/results", "alice-token")).json()) as {
      results: { title: string }[];
    };
    expect(a.results[0].title).toBe("MAKE SOMETHING.");
  });
  it("不整合・不正な範囲と大きすぎる本文を拒否する", async () => {
    expect(
      (await request("/me/results", "alice-token", { ...result, total: 50 }))
        .status,
    ).toBe(400);
    expect(
      (
        await request("/me/results", "alice-token", {
          ...result,
          title: "x".repeat(26000),
        })
      ).status,
    ).toBe(413);
  });
  it("期限切れのセッションと署名不正のGoogleトークンを拒否する", async () => {
    sqlite
      .prepare("UPDATE sessions SET expires_at=0 WHERE user_id=?")
      .run("alice");
    expect((await request("/me/profile", "alice-token")).status).toBe(401);
    expect(
      (
        await request("/auth/google", undefined, {
          credential: "x".repeat(200),
        })
      ).status,
    ).toBe(401);
  });
  it("設定は本人にのみ保存される", async () => {
    const settings = {
      music: 0.7,
      effects: 0.5,
      offset: 25,
      speed: 1,
      vibration: true,
      reducedMotion: false,
    };
    await request("/me/settings", "alice-token", settings);
    expect(await (await request("/me/settings", "bob-token")).json()).toEqual({
      settings: null,
    });
    expect(await (await request("/me/settings", "alice-token")).json()).toEqual(
      { settings },
    );
  });
});
describe("AI予算と失敗経路", () => {
  const input = {
    bpm: 120,
    duration: 134,
    energy: Array(16).fill(0.5),
    style: "balanced",
  };
  it("数値を返し、同じユーザーの6回目はAIと全体予算を消費しない", async () => {
    for (let i = 0; i < 5; i++)
      expect((await request("/me/arrange", "alice-token", input)).status).toBe(
        200,
      );
    expect((await request("/me/arrange", "alice-token", input)).status).toBe(
      429,
    );
    expect(ai).toHaveBeenCalledTimes(5);
    expect(
      sqlite.prepare("SELECT count FROM usage WHERE scope='ai:global'").get()
        ?.count,
    ).toBe(5);
  });
  it("グローバル上限でもAIを呼ばない", async () => {
    sqlite
      .prepare("INSERT INTO usage VALUES(?,?,30)")
      .run("ai:global", new Date().toISOString().slice(0, 10));
    expect((await request("/me/arrange", "bob-token", input)).status).toBe(429);
    expect(ai).not.toHaveBeenCalled();
  });
  it("不正なAI出力は保存に渡さない", async () => {
    ai.mockResolvedValueOnce({ response: "not JSON" });
    expect((await request("/me/arrange", "alice-token", input)).status).toBe(
      502,
    );
  });
  it("実サービスが返す構造化されたJSON応答も受け付ける", async () => {
    ai.mockResolvedValueOnce({
      response: {
        density: Array(16).fill(0.9),
        edgeBias: 0.15,
        accentEvery: 4,
      },
    });
    expect((await request("/me/arrange", "alice-token", input)).status).toBe(
      200,
    );
  });
});
