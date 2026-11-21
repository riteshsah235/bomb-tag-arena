import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "node:url";
import { Arena } from "./arena.js";

// One process owns all rooms. No database, credentials, or third-party relay.
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  next();
});
app.get("/health", (_, res) => res.json({ ok: true }));
app.use(
  express.static(fileURLToPath(new URL("../public", import.meta.url)), {
    maxAge: "5m",
  }),
);
const server = createServer(app),
  rooms = new Map();
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 256,
  perMessageDeflate: false,
});
const connections = new Map();
server.on("upgrade", (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    socket.destroy();
    return;
  }
  const match = /^\/room\/([A-Z2-9]{6})$/.exec(url.pathname);
  if (!match) {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    return;
  }
  // Basic local socket cap. This is not a substitute for a hosting-level DDoS filter.
  const ip = req.socket.remoteAddress;
  if ((connections.get(ip) || 0) >= 24) {
    socket.end("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
    return;
  }
  const code = match[1];
  let room = rooms.get(code);
  if ((room && room.players.size >= 8) || (!room && rooms.size >= 100)) {
    socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    connections.set(ip, (connections.get(ip) || 0) + 1);
    ws.once("close", () => {
      const n = (connections.get(ip) || 1) - 1;
      if (n) connections.set(ip, n);
      else connections.delete(ip);
    });
    if (!room) {
      room = new Arena(() => rooms.delete(code));
      rooms.set(code, room);
    }
    room.join(ws, url.searchParams.get("name"));
  });
});
function shutdown() {
  for (const ws of wss.clients)
    ws.close(1012, "Server restarting. Please rejoin.");
  for (const room of rooms.values()) clearInterval(room.timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
const port = Number(process.env.PORT) || 3000;
server.listen(port, "0.0.0.0", () =>
  console.log(`Bomb Tag listening on port ${port}`),
);
