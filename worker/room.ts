export class LeaderboardRoom {
  constructor(private ctx: DurableObjectState) {}
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path === "/broadcast" && request.method === "POST") {
      const event = await request.text();
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(event);
        } catch {
          ws.close(1011, "reconnect");
        }
      }
      return new Response("ok");
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("websocket required", { status: 426 });
    if (this.ctx.getWebSockets().length >= 100)
      return new Response("room connection limit", { status: 429 });
    const pair = new WebSocketPair(),
      [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "connected", at: Date.now() }));
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 64) {
      ws.close(1009, "message too large");
      return;
    }
    if (message === "ping") ws.send("pong");
  }
  webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {}
  }
  webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, "reconnect");
    } catch {}
  }
}
