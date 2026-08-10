import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { createServer } from "node:http";
import { Server } from "socket.io";
import bcrypt from "bcryptjs";
import multer from "multer";
import swagger from "swagger-ui-express";
import { db, reset, seed } from "./db.js";
import { auth, roles, sign } from "./auth.js";
import type { AuthRequest, Claims } from "./types.js";
import { spec } from "./openapi.js";
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
app.post("/api/auth/login", (q, r) => {
  const u = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get(q.body.email) as any;
  if (!u || !bcrypt.compareSync(q.body.password || "", u.password)) {
    if (u)
      db.prepare(
        "UPDATE users SET failed_attempts=failed_attempts+1 WHERE id=?",
      ).run(u.id);
    return r.status(401).json({ error: "Invalid email or password" });
  }
  if (u.locked) return r.status(423).json({ error: "Account is locked" });
  const user: Claims = { id: u.id, email: u.email, name: u.name, role: u.role };
  r.json({ token: sign(user, q.body.remember ? "7d" : "2h"), user });
});
app.post("/api/auth/register", (q, r) => {
  const { email, password, name } = q.body;
  if (
    !email ||
    !name ||
    !/(?=.*[A-Z])(?=.*\d)(?=.*[^\w]).{8,}/.test(password || "")
  )
    return r
      .status(422)
      .json({ error: "Use a name, email, and strong password" });
  try {
    const x = db
      .prepare(
        "INSERT INTO users(email,name,password,role,verified) VALUES(?,?,?,'USER',0)",
      )
      .run(email, name, bcrypt.hashSync(password, 10));
    r.status(201).json({
      id: Number(x.lastInsertRowid),
      verificationCode: "TEST-VERIFY-123",
    });
  } catch {
    return r.status(409).json({ error: "Email already registered" });
  }
});
app.get("/api/auth/me", auth, (q: AuthRequest, r) => r.json(q.user));
app.post("/api/auth/forgot", (_q, r) =>
  r.json({ message: "Reset email simulated", resetCode: "RESET-123" }),
);
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
app.post("/api/forms", (q, r) =>
  q.body.email === "server-error@test.local"
    ? r.status(422).json({ error: "Server-side email rejection" })
    : r
        .status(201)
        .json({
          id: Number(
            db
              .prepare(
                "INSERT INTO form_submissions(data,created_at) VALUES(?,?)",
              )
              .run(JSON.stringify(q.body), new Date().toISOString())
              .lastInsertRowid,
          ),
          data: q.body,
          message: "Form submitted successfully",
        }),
);
const upload = multer({ dest: "uploads/", limits: { fileSize: 5e6 } });
app.post("/api/files/upload", upload.array("files", 5), (q, r) =>
  r
    .status(201)
    .json({
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
    : r
        .status(c)
        .json({
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
  testMode ? n() : r.status(404).json({ error: "Test controls disabled" });
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
io.on("connection", (s) => {
  s.emit("status", { online: true, id: s.id });
  s.on("chat", (m) => io.emit("chat", { ...m, id: `msg-${Date.now()}` }));
});
const dist = path.resolve("dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((_q, r) => r.sendFile(path.join(dist, "index.html")));
}
server.listen(Number(process.env.PORT || 3000), () =>
  console.log("E2E Test Lab ready"),
);
