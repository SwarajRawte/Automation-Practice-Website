import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import {
  advanceClock,
  ClockValidationError,
  freezeClock,
  getClockState,
  MAX_CLOCK_ADVANCE_MS,
  nowIso,
  nowMs,
  resetClock,
} from "./clock.js";
import { authenticateAccessToken, auth, sign } from "./auth.js";
import { authRouter, resetAuthRateLimits } from "./authRoutes.js";
import { clockRouter } from "./clockRoutes.js";
import { db, reset } from "./db.js";

beforeEach(() => {
  process.env.TEST_MODE = "true";
  process.env.TEST_CONTROL_KEY = "clock-control";
  resetAuthRateLimits();
  reset();
});
afterEach(resetClock);

test("clock freezes, advances deterministically, and resets to real time", () => {
  const frozen = freezeClock("2030-02-03T04:05:06.007Z");
  assert.deepEqual(frozen, {
    mode: "frozen",
    nowMs: 1_896_321_906_007,
    now: "2030-02-03T04:05:06.007Z",
  });
  assert.equal(nowIso(), "2030-02-03T04:05:06.007Z");
  assert.equal(nowMs(), frozen.nowMs);
  assert.equal(
    advanceClock(2_500).now,
    "2030-02-03T04:05:08.507Z",
  );
  resetClock();
  assert.equal(getClockState().mode, "real");
  assert.ok(Math.abs(nowMs() - Date.now()) < 100);
});

test("clock rejects malformed freezes and unsafe advances", () => {
  for (const value of [undefined, "2030-02-03", "2030-02-30T00:00:00Z"])
    assert.throws(() => freezeClock(value), ClockValidationError);
  assert.throws(() => advanceClock(1), ClockValidationError);
  freezeClock("2030-01-01T00:00:00Z");
  for (const value of [0, -1, 1.5, MAX_CLOCK_ADVANCE_MS + 1, "1000"])
    assert.throws(() => advanceClock(value), ClockValidationError);
});

test("JWT issue and expiry follow logical time", () => {
  freezeClock("2030-01-01T00:00:00Z");
  const user = db
      .prepare("SELECT id,email,name,role,session_version FROM users WHERE id=2")
      .get() as any,
    token = sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sessionVersion: user.session_version,
      },
      "2s",
    );
  assert.ok(authenticateAccessToken(token));
  advanceClock(2_000);
  assert.equal(authenticateAccessToken(token), null);
});

test("JWT issue and verification preserve the Unix epoch", () => {
  freezeClock("1970-01-01T00:00:00.000Z");
  const user = db
      .prepare("SELECT id,email,name,role,session_version FROM users WHERE id=2")
      .get() as any,
    token = sign({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionVersion: user.session_version,
    }),
    payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    ) as { iat: number };
  assert.equal(payload.iat, 0);
  assert.ok(authenticateAccessToken(token));
});

test("access tokens issued in the logical future fail after rewinding", () => {
  freezeClock("2030-01-01T00:00:00Z");
  const user = db
      .prepare("SELECT id,email,name,role,session_version FROM users WHERE id=2")
      .get() as any,
    token = sign({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionVersion: user.session_version,
    });
  assert.ok(authenticateAccessToken(token));
  resetClock();
  assert.equal(authenticateAccessToken(token), null);
});

test("database tokens issued in the logical future fail after rewinding", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  freezeClock("2030-01-01T00:00:00Z");
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "user@testlab.local", password: "User123!" })
    .expect(200);
  resetClock();
  await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: login.body.refreshToken })
    .expect(401);
});

test("clock test controls support GET, actions, and legacy freeze input", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api", clockRouter);
  app.use("/api", auth);
  const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@testlab.local", password: "Admin123!" })
      .expect(200),
    headers = {
      authorization: `Bearer ${login.body.token}`,
      "x-test-key": "clock-control",
    };
  await request(app)
    .post("/api/test/clock")
    .set(headers)
    .send({ at: "2026-01-15T12:00:00Z" })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.clock.mode, "frozen");
      assert.equal(body.clock.now, "2026-01-15T12:00:00.000Z");
    });
  await request(app)
    .post("/api/test/clock")
    .set(headers)
    .send({ action: "freeze", at: "2030-01-01T00:00:00Z" })
    .expect(200);
  await request(app)
    .post("/api/test/clock")
    .set(headers)
    .send({ action: "unfreeze" })
    .expect(200);
  await request(app)
    .post("/api/test/clock")
    .set(headers)
    .send({ at: "2026-01-15T12:00:00Z" })
    .expect(200);
  await request(app)
    .post("/api/test/clock")
    .set(headers)
    .send({ action: "advance", milliseconds: 60_000 })
    .expect(200);
  await request(app)
    .get("/api/test/clock")
    .set(headers)
    .expect("cache-control", /private, no-store/)
    .expect(200)
    .expect(({ body }) =>
      assert.equal(body.clock.now, "2026-01-15T12:01:00.000Z"),
    );
  await request(app)
    .post("/api/test/clock")
    .set(headers)
    .send({ action: "advance", milliseconds: MAX_CLOCK_ADVANCE_MS + 1 })
    .expect(422);
  await request(app)
    .post("/api/test/clock")
    .set(headers)
    .send({ action: "unfreeze" })
    .expect(200)
    .expect(({ body }) => assert.equal(body.clock.mode, "real"));
});
