import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server } from "socket.io";
import swagger from "swagger-ui-express";
import { db, reset, seed } from "./db.js";
import { auth, roles } from "./auth.js";
import { spec } from "./openapi.js";
import { authRouter } from "./authRoutes.js";
import { formsRouter } from "./formsRoutes.js";
import { phase3Router } from "./phase3Routes.js";
import {
  createPhase4Router,
  networkConfig,
  updateNetworkConfig,
} from "./phase4Routes.js";
import { testControlGuard } from "./testControl.js";
const app = express(),
  server = createServer(app),
  io = new Server(server, { cors: { origin: "*" } });
app.use(cors());
app.use(express.json());
app.use((q, r, n) => {
  r.set("x-request-id", `req-${randomUUID()}`);
  n();
});
app.get("/api/health", (_q, r) => r.json({ status: "UP" }));
app.use("/api/docs", swagger.serve, swagger.setup(spec));
app.use("/api/auth", authRouter);
app.use("/api", auth);
app.use("/api", formsRouter);
app.use("/api", phase3Router);
app.use("/api", createPhase4Router(io));
app.get("/api/users", auth, roles("ADMIN"), (q, r) => {
  const requestedPage = Number(q.query.page),
    requestedSize = Number(q.query.size),
    page =
      Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    size =
      Number.isInteger(requestedSize) && requestedSize > 0
        ? Math.min(requestedSize, 100)
        : 20;
  r.json({
    data: Array.from({ length: size }, (_, i) => {
      const id = (page - 1) * size + i + 1;
      return {
        id,
        email: `qa.user${String(id).padStart(3, "0")}@testlab.local`,
        name: `QA User ${String(id).padStart(3, "0")}`,
        role: id % 10 ? "USER" : "ADMIN",
        status: id % 9 ? "ACTIVE" : "INACTIVE",
      };
    }),
    page,
    size,
    total: 100,
  });
});
app.get("/api/files/download", (_q, r) =>
  r
    .attachment("test-lab-download.txt")
    .send("Deterministic E2E Test Lab download\n"),
);
app.all("/api/status/:code", (q, r) => {
  const c = Number(q.params.code);
  if (!Number.isInteger(c) || c < 200 || c > 599)
    return r.status(422).json({
      error: "Status code must be an integer between 200 and 599",
      code: "INVALID_STATUS_CODE",
    });
  c === 204
    ? r.status(c).end()
    : r.status(c).json({
        status: c,
        message: `Simulated HTTP ${c}`,
        requestId: r.get("x-request-id"),
      });
});
app.get("/api/delay/:ms", (q, r) => {
  const delay = Number(q.params.ms);
  if (!Number.isInteger(delay) || delay < 0 || delay > 10_000)
    return r.status(422).json({
      error: "Delay must be an integer between 0 and 10000",
      code: "INVALID_DELAY",
    });
  return setTimeout(() => r.json({ completed: true, delay }), delay);
});
app.post("/api/test/reset", testControlGuard, (_q, r) => {
  reset();
  r.json({ message: "Database reset" });
});
app.post("/api/test/seed", testControlGuard, (_q, r) => {
  seed();
  r.json({ message: "Database seeded" });
});
app.post("/api/test/clock", testControlGuard, (q, r) =>
  r.json({ clock: q.body }),
);
app.post("/api/test/network", testControlGuard, (q, r) => {
  const error = updateNetworkConfig(q.body);
  return error
    ? r.status(422).json({ error })
    : r.json({ network: networkConfig });
});
app.post("/api/test/events", testControlGuard, (q, r) => {
  io.emit("test-event", q.body);
  r.json({ sent: true });
});
app.post("/api/test/users/:id/lock", testControlGuard, (q, r) => {
  const locked = q.body.locked === false ? 0 : 1;
  const result = db
    .prepare("UPDATE users SET locked=?,failed_attempts=? WHERE id=?")
    .run(
      locked,
      locked ? Number(process.env.MAX_LOGIN_ATTEMPTS || 5) : 0,
      String(q.params.id),
    );
  if (!result.changes)
    return r.status(404).json({ error: "User not found" });
  r.json({ id: Number(q.params.id), locked: Boolean(locked) });
});
app.post(
  "/api/test/sessions/:userId/expire",
  testControlGuard,
  (q, r) => {
    const user = db
      .prepare("SELECT id FROM users WHERE id=?")
      .get(String(q.params.userId));
    if (!user) return r.status(404).json({ error: "User not found" });
    const result = db
      .prepare(
        "UPDATE auth_tokens SET revoked=1 WHERE user_id=? AND type='refresh'",
      )
      .run(String(q.params.userId));
    db.prepare(
      "UPDATE users SET session_version=session_version+1 WHERE id=?",
    ).run(String(q.params.userId));
    r.json({
      userId: Number(q.params.userId),
      expiredSessions: Number(result.changes),
    });
  },
);
app.get("/api/admin/audit", auth, roles("ADMIN"), (_q, r) =>
  r.json({
    data: db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 100").all(),
  }),
);
io.on("connection", (s) => {
  s.emit("status", { online: true, id: s.id });
  s.on("chat", (message) => {
    const text =
      typeof message === "object" &&
      message !== null &&
      "text" in message
        ? String(message.text).slice(0, 2_000)
        : String(message ?? "").slice(0, 2_000);
    io.emit("chat", { text, id: `msg-${randomUUID()}` });
  });
  s.on("counter", () => io.emit("counter", { value: Date.now() % 1000 }));
  s.on("disconnect", () =>
    s.broadcast.emit("presence", { online: false, id: s.id }),
  );
});
// API requests must never fall through to the SPA's HTML response. This keeps
// every client-side API error parseable and makes incorrect routes diagnosable.
app.use("/api", (_q, r) =>
  r.status(404).json({ error: "API endpoint not found", code: "NOT_FOUND" }),
);
app.use(
  "/api",
  (
    error: Error,
    _q: express.Request,
    r: express.Response,
    _next: express.NextFunction,
  ) => {
    void _next;
    console.error(error);
    const status = (error as Error & { status?: number }).status || 500;
    r.status(status).json({
      error:
        status < 500
          ? "The request body is invalid"
          : "The server could not process the request",
      code: status < 500 ? "INVALID_REQUEST" : "INTERNAL_ERROR",
    });
  },
);
const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  const indexHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  app.use((_q, r) => r.type("html").send(indexHtml));
}
const port = Number(process.env.PORT || 3100);
server.listen(port, () =>
  console.log(`E2E Test Lab API ready at http://localhost:${port}`),
);
