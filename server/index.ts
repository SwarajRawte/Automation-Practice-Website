import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server } from "socket.io";
import multer from "multer";
import swagger from "swagger-ui-express";
import { db, reset, seed } from "./db.js";
import { auth, roles } from "./auth.js";
import { spec } from "./openapi.js";
import { authRouter } from "./authRoutes.js";
const app = express(),
  server = createServer(app),
  io = new Server(server, { cors: { origin: "*" } }),
  testMode = process.env.TEST_MODE !== "false";
app.use(cors());
app.use(express.json());
app.use((q, r, n) => {
  r.set("x-request-id", `req-${Date.now()}`);
  n();
});
app.get("/api/health", (_q, r) => r.json({ status: "UP" }));
app.use("/api/docs", swagger.serve, swagger.setup(spec));
app.use("/api/auth", authRouter);
app.use("/api", auth);
app.get("/api/products", (q, r) => {
  const page = Math.max(1, Number(q.query.page) || 1),
    size = Math.min(100, Number(q.query.size) || 10),
    s = `%${String(q.query.q || "")}%`;
  const data = db
      .prepare(
        "SELECT * FROM products WHERE name LIKE ? OR category LIKE ? ORDER BY id LIMIT ? OFFSET ?",
      )
      .all(s, s, size, (page - 1) * size),
    total = (
      db
        .prepare("SELECT COUNT(*) c FROM products WHERE name LIKE ?")
        .get(s) as any
    ).c;
  r.json({ data, page, size, total });
});
app.post("/api/products", auth, roles("ADMIN"), (q, r) => {
  try {
    const b = q.body,
      x = db
        .prepare(
          "INSERT INTO products(name,category,price,inventory,status,updated_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          b.name,
          b.category,
          b.price,
          b.inventory,
          b.inventory ? "ACTIVE" : "OUT_OF_STOCK",
          new Date().toISOString(),
        );
    r.status(201).json(
      db.prepare("SELECT * FROM products WHERE id=?").get(x.lastInsertRowid),
    );
  } catch {
    return r.status(409).json({ error: "Product name must be unique" });
  }
});
app.delete("/api/products/:id", auth, roles("ADMIN"), (q, r) => {
  db.prepare("DELETE FROM products WHERE id=?").run(String(q.params.id));
  r.status(204).end();
});
app.get("/api/users", auth, roles("ADMIN"), (q, r) => {
  const page = Number(q.query.page) || 1,
    size = Number(q.query.size) || 20;
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
app.post("/api/forms", (q, r) => {
  const errors: Record<string, string> = {};
  if (!q.body.name || String(q.body.name).length < 2)
    errors.name = "Name must contain at least 2 characters";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(q.body.email || "")))
    errors.email = "A valid email is required";
  if (q.body.email === "server-error@test.local")
    errors.email = "This email is rejected by the server test scenario";
  if (q.body.password !== q.body.confirmPassword)
    errors.confirmPassword = "Passwords must match";
  if (
    q.body.quantity &&
    (Number(q.body.quantity) < 1 || Number(q.body.quantity) > 10)
  )
    errors.quantity = "Quantity must be between 1 and 10";
  if (q.body.employment === "Employed" && !q.body.company)
    errors.company = "Company is required when employed";
  if (Object.keys(errors).length)
    return r.status(422).json({ error: "Form validation failed", errors });
  const id = Number(
    db
      .prepare("INSERT INTO form_submissions(data,created_at) VALUES(?,?)")
      .run(JSON.stringify(q.body), new Date().toISOString()).lastInsertRowid,
  );
  return r
    .status(201)
    .json({ id, data: q.body, message: "Form submitted successfully" });
});
app.get("/api/forms/:id", (q, r) => {
  const row = db
    .prepare("SELECT * FROM form_submissions WHERE id=?")
    .get(String(q.params.id)) as
    { id: number; data: string; created_at: string } | undefined;
  return row
    ? r.json({
        id: row.id,
        data: JSON.parse(row.data),
        createdAt: row.created_at,
      })
    : r.status(404).json({ error: "Form submission not found" });
});
const upload = multer({ dest: "uploads/", limits: { fileSize: 5e6 } });
app.post("/api/files/upload", upload.array("files", 5), (q, r) =>
  r.status(201).json({
    files: (q.files as Express.Multer.File[]).map((f) => ({
      name: f.originalname,
      size: f.size,
    })),
  }),
);
app.get("/api/files/download", (_q, r) =>
  r
    .attachment("test-lab-download.txt")
    .send("Deterministic E2E Test Lab download\n"),
);
app.all("/api/status/:code", (q, r) => {
  const c = Number(q.params.code);
  c === 204
    ? r.status(c).end()
    : r.status(c).json({
        status: c,
        message: `Simulated HTTP ${c}`,
        requestId: r.get("x-request-id"),
      });
});
app.get("/api/delay/:ms", (q, r) =>
  setTimeout(
    () => r.json({ completed: true, delay: Number(q.params.ms) }),
    Math.min(Number(q.params.ms), 1e4),
  ),
);
const only = (q: any, r: any, n: any) =>
  !testMode
    ? r.status(404).json({ error: "Test controls disabled" })
    : q.get("x-test-key") ===
        (process.env.TEST_CONTROL_KEY || "testlab-control")
      ? n()
      : r.status(403).json({ error: "Invalid test control key" });
app.post("/api/test/reset", only, (_q, r) => {
  reset();
  r.json({ message: "Database reset" });
});
app.post("/api/test/seed", only, (_q, r) => {
  seed();
  r.json({ message: "Database seeded" });
});
for (const name of ["clock", "network"])
  app.post(`/api/test/${name}`, only, (q, r) => r.json({ [name]: q.body }));
app.post("/api/test/events", only, (q, r) => {
  io.emit("test-event", q.body);
  r.json({ sent: true });
});
app.post("/api/test/users/:id/lock", only, (q, r) => {
  const locked = q.body.locked === false ? 0 : 1;
  db.prepare("UPDATE users SET locked=?,failed_attempts=? WHERE id=?").run(
    locked,
    locked ? Number(process.env.MAX_LOGIN_ATTEMPTS || 5) : 0,
    String(q.params.id),
  );
  r.json({ id: Number(q.params.id), locked: Boolean(locked) });
});
app.post("/api/test/sessions/:userId/expire", only, (q, r) => {
  const result = db
    .prepare(
      "UPDATE auth_tokens SET revoked=1 WHERE user_id=? AND type='refresh'",
    )
    .run(String(q.params.userId));
  r.json({
    userId: Number(q.params.userId),
    expiredSessions: Number(result.changes),
  });
});
app.get("/api/admin/audit", auth, roles("ADMIN"), (_q, r) =>
  r.json({
    data: db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 100").all(),
  }),
);
io.on("connection", (s) => {
  s.emit("status", { online: true, id: s.id });
  s.on("chat", (m) => io.emit("chat", { ...m, id: `msg-${Date.now()}` }));
});
const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  const indexHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  app.use((_q, r) => r.type("html").send(indexHtml));
}
server.listen(Number(process.env.PORT || 3000), () =>
  console.log("E2E Test Lab ready"),
);
