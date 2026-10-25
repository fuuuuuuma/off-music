let expectedUser: string | null = null;
export function setApiUser(id: string | null) {
  expectedUser = id;
}
export async function api<T>(
  path: string,
  data?: unknown,
  method?: string,
): Promise<T> {
  const res = await fetch("/api" + path, {
    method: method || (data === undefined ? "GET" : "POST"),
    headers:
      data !== undefined
        ? {
            "Content-Type": "application/json",
            "X-Off-Music": "1",
            ...(expectedUser ? { "X-Off-User": expectedUser } : {}),
          }
        : undefined,
    body: data !== undefined ? JSON.stringify(data) : undefined,
    credentials: "same-origin",
    signal: AbortSignal.timeout(path === "/me/arrange" ? 35000 : 15000),
  });
  const body = (await res
    .json()
    .catch(() => ({ error: "サーバーに接続できませんでした" }))) as {
    error?: string;
  };
  if (!res.ok) {
    if (
      data !== undefined &&
      path.startsWith("/me/") &&
      (res.status === 401 || res.status === 409)
    )
      window.dispatchEvent(new Event("off-auth-change"));
    throw new Error(body.error || "処理に失敗しました");
  }
  return body as T;
}
