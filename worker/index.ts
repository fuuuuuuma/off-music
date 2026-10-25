import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import {
  arrangeSchema,
  arrangementSchema,
  resultSchema,
  settingsSchema,
} from "./schema.ts";
import { calculateScore } from "../src/lib/chart.ts";
import type { Env, Account } from "./env.ts";
import social from "./social.ts";
import resets from "./reset.ts";
import { joinCommunity } from "./community.ts";
export { LeaderboardRoom } from "./room.ts";
const app = new Hono<{ Bindings: Env; Variables: { user: Account } }>();
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
const secure = (url: string) => new URL(url).protocol === "https:";
const random = () => crypto.randomUUID() + crypto.randomUUID();
app.use("/api/*", async (c, next) => {
  const path = c.req.path;
  const maxSize =
    c.req.method === "PUT" && path.endsWith("/audio")
      ? 20971520
      : path.match(/\/groups\/[^/]+\/songs$/)
        ? 786432
        : path.includes("/plays")
          ? 1048576
          : 24576;
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ error: "データが大きすぎます" }, 413),
  })(c, next);
});
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD"].includes(c.req.method)) {
    const origin = c.req.header("Origin"),
      url = new URL(c.req.url);
    const origins = [c.env.APP_ORIGIN, url.origin];
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost")
      origins.push("http://127.0.0.1:5190", "http://localhost:5190");
    if (
      !origin ||
      !origins.includes(origin) ||
      c.req.header("X-Off-Music") !== "1" ||
      !(
        c.req.header("Content-Type")?.startsWith("application/json") ||
        (c.req.method === "PUT" &&
          c.req.path.endsWith("/audio") &&
          c.req.header("Content-Type") === "application/octet-stream")
      )
    )
      return c.json({ error: "この操作は許可されていません" }, 403);
  }
  await next();
});
app.get("/api/config", (c) =>
  c.json({
    googleClientId: c.env.GOOGLE_CLIENT_ID || null,
    ai: !!c.env.AI,
    version: "4.0.0",
  }),
);
app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({
    ok: true,
    version: "4.0.0",
    google: !!c.env.GOOGLE_CLIENT_ID,
    ai: !!c.env.AI,
  });
});
app.get("/api/auth/nonce", (c) => {
  const nonce = random();
  setCookie(c, "off_nonce", nonce, {
    httpOnly: true,
    secure: secure(c.req.url),
    sameSite: "Strict",
    path: "/api/auth",
    maxAge: 600,
  });
  return c.json({ nonce });
});
app.post("/api/auth/google", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID)
    return c.json({ error: "Google認証の設定が完了していません" }, 503);
  const data = z
    .object({ credential: z.string().min(100).max(12000) })
    .parse(await c.req.json());
  const nonce = getCookie(c, "off_nonce");
  if (!nonce) return c.json({ error: "ログイン画面を開き直してください" }, 401);
  let payload;
  try {
    ({ payload } = await jwtVerify(data.credential, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: c.env.GOOGLE_CLIENT_ID,
      algorithms: ["RS256"],
      maxTokenAge: "10m",
    }));
  } catch {
    return c.json({ error: "Google認証を確認できませんでした" }, 401);
  }
  if (
    payload.nonce !== nonce ||
    typeof payload.sub !== "string" ||
    !payload.email_verified
  )
    return c.json({ error: "Google認証を確認できませんでした" }, 401);
  const name =
    typeof payload.name === "string" ? payload.name.slice(0, 80) : "プレイヤー";
  const picture =
    typeof payload.picture === "string" &&
    payload.picture.startsWith("https://lh3.googleusercontent.com/")
      ? payload.picture
      : null;
  const token = random(),
    expires = Date.now() + 7 * 86400000;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO users(id,name,picture,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,picture=excluded.picture",
    ).bind(payload.sub, name, picture, Date.now()),
    c.env.DB.prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    ).bind(await hash(token), payload.sub, expires),
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(
      Date.now(),
    ),
  ]);
  await joinCommunity(c.env.DB, payload.sub);
  deleteCookie(c, "off_nonce", { path: "/api/auth" });
  setCookie(c, "off_session", token, {
    httpOnly: true,
    secure: secure(c.req.url),
    sameSite: "Lax",
    path: "/api",
    maxAge: 7 * 86400,
  });
  return c.json({ user: { id: payload.sub, name, picture } });
});
// Logout also works for an already expired session.
app.post("/api/auth/logout", async (c) => {
  const token = getCookie(c, "off_session");
  if (token)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(token))
      .run();
  deleteCookie(c, "off_session", { path: "/api" });
  return c.json({ ok: true });
});
app.use("/api/me/*", async (c, next) => {
  const token = getCookie(c, "off_session");
  if (!token) return c.json({ error: "Googleでログインしてください" }, 401);
  const user = await c.env.DB.prepare(
    "SELECT u.id,u.name,u.picture FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
  )
    .bind(await hash(token), Date.now())
    .first<Account>();
  if (!user) return c.json({ error: "ログインの有効期限が切れました" }, 401);
  if (
    (!["GET", "HEAD"].includes(c.req.method) || !!c.req.header("X-Off-User")) &&
    c.req.header("X-Off-User") !== user.id
  )
    return c.json(
      { error: "別のタブでログインが変わりました。ログインし直してください" },
      409,
    );
  c.set("user", user);
  await next();
});
app.route("/api/me", social);
app.route("/api/me", resets);
app.get("/api/me/profile", (c) => c.json({ user: c.get("user") }));
app.post("/api/me/logout", async (c) => {
  const token = getCookie(c, "off_session");
  if (token)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(token))
      .run();
  deleteCookie(c, "off_session", { path: "/api" });
  return c.json({ ok: true });
});
app.get("/api/me/results", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT data FROM results WHERE user_id=? ORDER BY created_at DESC LIMIT 300",
  )
    .bind(c.get("user").id)
    .all<{ data: string }>();
  return c.json({
    results: rows.results.map((r) => ({ ...JSON.parse(r.data), synced: true })),
  });
});
app.post("/api/me/results", async (c) => {
  const data = resultSchema.parse(await c.req.json());
  const score = calculateScore(data.perfect, data.great, data.good, data.total),
    accuracy = score / 10000;
  const result = {
    ...data,
    createdAt: Math.min(Date.now(), data.createdAt),
    score,
    accuracy,
    synced: true,
  };
  await c.env.DB.prepare(
    "INSERT INTO results(id,user_id,song_id,data,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,id) DO NOTHING",
  )
    .bind(
      data.id,
      c.get("user").id,
      data.songId,
      JSON.stringify(result),
      result.createdAt,
    )
    .run();
  // Personal records only. Keep bounded storage; never claim verified competitive rankings.
  await c.env.DB.prepare(
    "DELETE FROM results WHERE user_id=? AND id NOT IN (SELECT id FROM results WHERE user_id=? ORDER BY created_at DESC LIMIT 300)",
  )
    .bind(c.get("user").id, c.get("user").id)
    .run();
  return c.json({ ok: true, result });
});
app.get("/api/me/settings", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT data FROM preferences WHERE user_id=?",
  )
    .bind(c.get("user").id)
    .first<{ data: string }>();
  return c.json({ settings: row ? JSON.parse(row.data) : null });
});
app.post("/api/me/settings", async (c) => {
  const settings = settingsSchema.parse(await c.req.json());
  await c.env.DB.prepare(
    "INSERT INTO preferences(user_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
  )
    .bind(c.get("user").id, JSON.stringify(settings), Date.now())
    .run();
  return c.json({ ok: true });
});
app.post("/api/me/arrange", async (c) => {
  const input = arrangeSchema.parse(await c.req.json()),
    day = new Date().toISOString().slice(0, 10);
  const scope = "ai:" + c.get("user").id;
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO usage(scope,day,count) VALUES(?,?,0),(?,?,0)",
  )
    .bind("ai:global", day, scope, day)
    .run();
  // Materialize both counts before a single atomic UPDATE. A rejected per-user
  // request cannot spend everybody else's daily budget, even under concurrency.
  const reserved = await c.env.DB.prepare(
    "WITH budget AS MATERIALIZED (SELECT MAX(CASE WHEN scope='ai:global' THEN count END) AS global_count, MAX(CASE WHEN scope=? THEN count END) AS user_count FROM usage WHERE day=? AND scope IN ('ai:global',?)) UPDATE usage SET count=count+1 WHERE day=? AND scope IN ('ai:global',?) AND (SELECT global_count<30 AND user_count<5 FROM budget) RETURNING scope",
  )
    .bind(scope, day, scope, day, scope)
    .all();
  if (reserved.results.length !== 2)
    return c.json(
      {
        error:
          "本日のAIアレンジ上限に達しました（1人5回・全体30回）。通常の譜面で遊べます",
      },
      429,
    );
  await c.env.DB.prepare("DELETE FROM usage WHERE day < ?")
    .bind(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
    .run();
  try {
    const response = await c.env.AI.run(
      c.env.AI_MODEL as Parameters<Ai["run"]>[0],
      {
        messages: [
          {
            role: "system",
            content:
              "You arrange a three-input rhythm game. Preserve attack timing; only adjust density. Return ONLY JSON with density: array of exactly 16 numbers (0.65..1.4), edgeBias: number (0.06..0.22), accentEvery: integer (2..8). Higher energy means higher density. Flow style is gentle; challenge is varied; balanced is moderate. No text, no extra keys.",
          },
          { role: "user", content: JSON.stringify(input) },
        ],
        max_tokens: 240,
        temperature: 0.35,
      },
    );
    const output = response as { response?: unknown };
    const raw = output.response ?? response;
    const match = typeof raw === "string" ? raw.match(/\{[\s\S]*\}/) : null;
    const arrangement = arrangementSchema.parse(
      typeof raw === "string" ? (match ? JSON.parse(match[0]) : null) : raw,
    );
    return c.json({
      arrangement,
      provider: "Cloudflare Workers AI",
      model: c.env.AI_MODEL,
    });
  } catch (error) {
    console.warn(
      "AI arrangement failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return c.json(
      { error: "AIアレンジを生成できませんでした。元の譜面はそのまま使えます" },
      502,
    );
  }
});
app.notFound((c) => c.json({ error: "見つかりませんでした" }, 404));
app.onError((error, c) => {
  if (error instanceof z.ZodError)
    return c.json({ error: "入力内容を確認してください" }, 400);
  if (error instanceof SyntaxError)
    return c.json({ error: "データの形式が正しくありません" }, 400);
  return c.json(
    { error: "処理を完了できませんでした。もう一度お試しください" },
    500,
  );
});
export default app;
