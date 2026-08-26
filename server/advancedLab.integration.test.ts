import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import express from "express";
import request from "supertest";
import { createAdvancedLabRouter } from "./advancedLabRoutes.js";
import { advanceClock, freezeClock } from "./clock.js";
import {
  captureDatabaseSnapshot,
  db,
  reset,
  restoreDatabaseSnapshot,
} from "./db.js";
import { createSecondOriginApp } from "./secondOrigin.js";
import type { AuthRequest } from "./types.js";

const app = express();
app.use(express.json());
app.use((req: AuthRequest, _res, next) => {
  req.user = {
    id: 2,
    email: "user@testlab.local",
    name: "Standard User",
    role: "USER",
  };
  next();
});
app.use("/api", createAdvancedLabRouter());

beforeEach(() => reset());

test("mock mailbox code can be read, verified once, and cleared", async () => {
  await request(app)
    .post("/api/advanced/mailbox/code")
    .expect("cache-control", /private, no-store/)
    .expect(201);
  const mailbox = await request(app)
    .get("/api/advanced/mailbox")
    .expect("cache-control", /private, no-store/)
    .expect(200);
  assert.equal(mailbox.body.total, 1);
  assert.match(mailbox.body.data[0].code, /^\d{6}$/);
  assert.equal(mailbox.body.data[0].used, false);

  await request(app)
    .post("/api/advanced/mailbox/verify")
    .send({ code: "000000" })
    .expect(422);
  await request(app)
    .post("/api/advanced/mailbox/verify")
    .send({ code: mailbox.body.data[0].code })
    .expect("cache-control", /private, no-store/)
    .expect(200)
    .expect({ verified: true, message: "Sign-in code verified" });
  await request(app)
    .post("/api/advanced/mailbox/verify")
    .send({ code: mailbox.body.data[0].code })
    .expect(422);
  await request(app)
    .delete("/api/advanced/mailbox")
    .expect("cache-control", /private, no-store/)
    .expect(204);
  await request(app)
    .get("/api/advanced/mailbox")
    .expect(200)
    .expect((response) => assert.equal(response.body.total, 0));
});

test("OTP verification attempts are bounded per user and run", async () => {
  await request(app).post("/api/advanced/mailbox/code").expect(201);
  for (let attempt = 0; attempt < 5; attempt += 1)
    await request(app)
      .post("/api/advanced/mailbox/verify")
      .send({ code: "000000" })
      .expect(422);
  await request(app)
    .post("/api/advanced/mailbox/verify")
    .send({ code: "000000" })
    .expect(429)
    .expect((response) =>
      assert.equal(response.body.code, "OTP_ATTEMPTS_EXCEEDED"),
    );

  await request(app).post("/api/advanced/mailbox/code").expect(201);
  const replacement = (await request(app).get("/api/advanced/mailbox")).body
    .data[0].code;
  await request(app)
    .post("/api/advanced/mailbox/verify")
    .send({ code: replacement })
    .expect(200);
});

test("a new mock code invalidates the previous code", async () => {
  await request(app).post("/api/advanced/mailbox/code").expect(201);
  const first = (await request(app).get("/api/advanced/mailbox")).body.data[0]
    .code;
  await request(app).post("/api/advanced/mailbox/code").expect(201);
  await request(app)
    .post("/api/advanced/mailbox/verify")
    .send({ code: first })
    .expect(422);
  const rows = db
    .prepare(
      "SELECT used FROM lab_otp_messages WHERE user_id=2 ORDER BY id ASC",
    )
    .all() as Array<{ used: number }>;
  assert.equal(rows[0].used, 1);
});

test("parallel verification can consume a code only once", async () => {
  await request(app).post("/api/advanced/mailbox/code").expect(201);
  const code = (await request(app).get("/api/advanced/mailbox")).body.data[0]
    .code;
  const responses = await Promise.all(
    Array.from({ length: 2 }, () =>
      request(app).post("/api/advanced/mailbox/verify").send({ code }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 422],
  );
});

test("mock codes expire against the deterministic server clock", async () => {
  freezeClock("2026-08-26T12:00:00.000Z");
  await request(app).post("/api/advanced/mailbox/code").expect(201);
  const code = (await request(app).get("/api/advanced/mailbox")).body.data[0]
    .code;
  advanceClock(5 * 60_000 + 1);
  await request(app)
    .post("/api/advanced/mailbox/verify")
    .send({ code })
    .expect(422)
    .expect((response) => assert.equal(response.body.code, "INVALID_OTP"));
});

test("mock mailbox data participates in isolated database snapshots", async () => {
  await request(app).post("/api/advanced/mailbox/code").expect(201);
  await request(app)
    .post("/api/advanced/mailbox/verify")
    .send({ code: "000000" })
    .expect(422);
  const snapshot = captureDatabaseSnapshot();
  db.exec("DELETE FROM lab_otp_messages");
  assert.equal(
    (
      db.prepare("SELECT COUNT(*) count FROM lab_otp_messages").get() as {
        count: number;
      }
    ).count,
    0,
  );
  restoreDatabaseSnapshot(snapshot);
  assert.equal(
    (
      db
        .prepare(
          "SELECT COUNT(*) count,MAX(failed_attempts) failedAttempts FROM lab_otp_messages",
        )
        .get() as {
        count: number;
        failedAttempts: number;
      }
    ).count,
    1,
  );
  assert.equal(
    (
      db
        .prepare("SELECT failed_attempts FROM lab_otp_messages LIMIT 1")
        .get() as { failed_attempts: number }
    ).failed_attempts,
    1,
  );
});

test("SSE lab validates limits and emits a finite deterministic sequence", async () => {
  await request(app).get("/api/advanced/events?limit=0").expect(422);
  const response = await request(app)
    .get("/api/advanced/events?limit=1")
    .expect("content-type", /text\/event-stream/)
    .expect(200);
  assert.match(response.text, /event: connected/);
  assert.match(response.text, /event: lab-message/);
  assert.match(response.text, /"sequence":1/);
  assert.doesNotMatch(response.text, /"sequence":2/);

  const incremental = await request(app)
    .get("/api/advanced/events?limit=2")
    .expect(200);
  assert.match(incremental.text, /"sequence":1/);
  assert.match(incremental.text, /"sequence":2/);
});

test("secondary origin serves a CSP-restricted frame and health response", async () => {
  const secondary = createSecondOriginApp("http://localhost:5173/path");
  await request(secondary)
    .get("/health")
    .expect("cache-control", /no-store/)
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.origin, "secondary");
      assert.equal(response.body.parentOrigin, "http://localhost:5173");
    });
  const frame = await request(secondary).get("/lab-frame").expect(200);
  assert.match(frame.headers["content-security-policy"], /frame-ancestors/);
  assert.match(frame.text, /event\.origin!==allowedParent/);
  assert.match(frame.text, /test-lab:pong/);
  assert.throws(
    () => createSecondOriginApp("javascript:alert(1)"),
    /HTTP or HTTPS/,
  );
});
