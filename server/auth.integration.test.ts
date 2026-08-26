import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { authRouter, resetAuthRateLimits } from "./authRoutes.js";
import { reset, db } from "./db.js";
import { auth, roles } from "./auth.js";
const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
app.get("/api/admin-check", auth, roles("ADMIN"), (_req, res) =>
  res.json({ allowed: true }),
);
beforeEach(() => {
  process.env.TEST_MODE = "true";
  delete process.env.AUTH_RATE_LIMIT;
  resetAuthRateLimits();
  reset();
});
test("admin can login, refresh, access profile, and logout", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({
      email: "admin@testlab.local",
      password: "Admin123!",
      remember: true,
    })
    .expect(200);
  assert.equal(login.body.user.role, "ADMIN");
  assert.equal(login.body.user.id, "user-admin-001");
  assert.ok(login.body.token);
  assert.ok(login.body.refreshToken);
  assert.equal(login.headers["cache-control"], "private, no-store");
  assert.match(String(login.headers["set-cookie"]), /access_token=/);
  assert.match(String(login.headers["set-cookie"]), /refresh_token=/);
  assert.match(String(login.headers["set-cookie"]), /HttpOnly/i);
  await request(app)
    .get("/api/auth/me")
    .set("authorization", `Bearer ${login.body.token}`)
    .expect(200)
    .expect((r) => assert.equal(r.body.email, "admin@testlab.local"));
  const refreshed = await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: login.body.refreshToken })
    .expect(200);
  assert.notEqual(refreshed.body.refreshToken, login.body.refreshToken);
  await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: login.body.refreshToken })
    .expect(401);
  await request(app)
    .post("/api/auth/logout")
    .send({ refreshToken: refreshed.body.refreshToken })
    .expect(200);
  await request(app)
    .get("/api/auth/session")
    .set("authorization", `Bearer ${refreshed.body.token}`)
    .expect(401);
  await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: refreshed.body.refreshToken })
    .expect(401);
});
test("login validates required fields and locked users deterministically", async () => {
  await request(app).post("/api/auth/login").send({}).expect(422);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "locked@testlab.local", password: "Locked123!" })
    .expect(423);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "locked@testlab.local", password: "wrong" })
    .expect(423);
});
test("registration requires verification before login", async () => {
  const registered = await request(app)
    .post("/api/auth/register")
    .send({
      name: "New Tester",
      email: "new@testlab.local",
      password: "NewUser123!",
    })
    .expect(201);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "new@testlab.local", password: "NewUser123!" })
    .expect(403);
  await request(app)
    .post("/api/auth/verify")
    .send({ token: registered.body.verificationToken })
    .expect(200);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "new@testlab.local", password: "NewUser123!" })
    .expect(200);
});
test("registration normalizes emails and rejects malformed identities", async () => {
  await request(app)
    .post("/api/auth/register")
    .send({ name: "Invalid", email: "not-an-email", password: "Valid123!" })
    .expect(422);
  const registered = await request(app)
    .post("/api/auth/register")
    .send({
      name: "  Normalized User  ",
      email: "  MIXED.CASE@testlab.local  ",
      password: "Valid123!",
    })
    .expect(201);
  assert.equal(registered.body.user.email, "mixed.case@testlab.local");
  assert.equal(registered.body.user.name, "Normalized User");
});
test("five failed attempts lock an account and reset password unlocks it", async () => {
  for (let i = 0; i < 5; i++)
    await request(app)
      .post("/api/auth/login")
      .send({ email: "user@testlab.local", password: "wrong" })
      .expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "user@testlab.local", password: "User123!" })
    .expect(423);
  const forgot = await request(app)
    .post("/api/auth/forgot")
    .send({ email: "user@testlab.local" })
    .expect(200);
  await request(app)
    .post("/api/auth/reset-password")
    .send({ token: forgot.body.resetToken, password: "Changed123!" })
    .expect(200);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "user@testlab.local", password: "Changed123!" })
    .expect(200);
});
test("password policy, duplicate registration, and change password errors are deterministic", async () => {
  await request(app)
    .post("/api/auth/register")
    .send({ name: "Weak", email: "weak@test.local", password: "weak" })
    .expect(422);
  const duplicate = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Duplicate",
      email: "admin@testlab.local",
      password: "Valid123!",
    })
    .expect("content-type", /json/)
    .expect(409);
  assert.equal(duplicate.body.error, "Email already registered");
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "viewer@testlab.local", password: "Viewer123!" })
    .expect(200);
  await request(app)
    .post("/api/auth/change-password")
    .set("authorization", `Bearer ${login.body.token}`)
    .send({ currentPassword: "wrong", newPassword: "Valid123!" })
    .expect(400);
  await request(app)
    .post("/api/auth/change-password")
    .set("authorization", `Bearer ${login.body.token}`)
    .send({ currentPassword: "Viewer123!", newPassword: "Valid123!" })
    .expect(200);
  await request(app)
    .get("/api/auth/me")
    .set("authorization", `Bearer ${login.body.token}`)
    .expect(401);
  await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: login.body.refreshToken })
    .expect(401);
  assert.ok(
    (
      db
        .prepare("SELECT COUNT(*) c FROM audit WHERE action='PASSWORD_CHANGED'")
        .get() as { c: number }
    ).c === 1,
  );
});
test("a weak reset attempt preserves the token and reset revokes active sessions", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "user@testlab.local", password: "User123!" })
    .expect(200);
  const forgot = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "user@testlab.local" })
    .expect(200);
  await request(app)
    .post("/api/auth/reset-password")
    .send({ token: forgot.body.resetToken, password: "weak" })
    .expect(422);
  await request(app)
    .post("/api/auth/reset-password")
    .send({ token: forgot.body.resetToken, password: "Replacement123!" })
    .expect(200);
  await request(app)
    .get("/api/auth/me")
    .set("authorization", `Bearer ${login.body.token}`)
    .expect(401);
  await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: login.body.refreshToken })
    .expect(401);
});
test("authorization uses the current database role instead of stale token claims", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@testlab.local", password: "Admin123!" })
    .expect(200);
  db.prepare("UPDATE users SET role='USER' WHERE id=1").run();
  await request(app)
    .get("/api/admin-check")
    .set("authorization", `Bearer ${login.body.token}`)
    .expect(403);
  const profile = await request(app)
    .get("/api/auth/me")
    .set("authorization", `Bearer ${login.body.token}`)
    .expect(200);
  assert.equal(profile.body.role, "USER");
});
test("cookie-only logout revokes the access session", async () => {
  const agent = request.agent(app),
    login = await agent
      .post("/api/auth/login")
      .send({ email: "admin@testlab.local", password: "Admin123!" })
      .expect(200);
  await agent.post("/api/auth/logout").send({}).expect(200);
  await request(app)
    .get("/api/auth/me")
    .set("authorization", `Bearer ${login.body.token}`)
    .expect(401);
});

test("refresh rotates through its HTTP-only cookie", async () => {
  const agent = request.agent(app),
    login = await agent
      .post("/api/auth/login")
      .send({ email: "user@testlab.local", password: "User123!" })
      .expect(200),
    refreshed = await agent.post("/api/auth/refresh").send({}).expect(200);
  assert.notEqual(refreshed.body.refreshToken, login.body.refreshToken);
  assert.match(String(refreshed.headers["set-cookie"]), /refresh_token=/);
  await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: login.body.refreshToken })
    .expect(401);
});

test("legacy body refresh can recover from a stale refresh cookie", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "user@testlab.local", password: "User123!" })
    .expect(200);
  await request(app)
    .post("/api/auth/refresh")
    .set("Cookie", "refresh_token=stale-cookie")
    .send({ refreshToken: login.body.refreshToken })
    .expect(200);
});

test("remembered refresh sessions remain persistent after rotation", async () => {
  const agent = request.agent(app),
    login = await agent
      .post("/api/auth/login")
      .send({
        email: "user@testlab.local",
        password: "User123!",
        remember: true,
      })
      .expect(200);
  assert.match(String(login.headers["set-cookie"]), /Max-Age=2592000/);
  const refreshed = await agent.post("/api/auth/refresh").send({}).expect(200);
  assert.match(String(refreshed.headers["set-cookie"]), /Max-Age=2592000/);
  const stored = db
    .prepare(
      "SELECT persistent FROM auth_tokens WHERE user_id=2 AND type='refresh' AND revoked=0",
    )
    .get() as { persistent: number };
  assert.equal(stored.persistent, 1);
});

test("stale refresh input cannot bypass access-session revocation", async () => {
  const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@testlab.local", password: "Admin123!" })
      .expect(200),
    accessCookie = (login.headers["set-cookie"] as unknown as string[])
      .find((value) => value.startsWith("access_token="))!
      .split(";", 1)[0];
  await request(app)
    .post("/api/auth/logout")
    .set("Cookie", accessCookie)
    .send({ refreshToken: "stale-refresh-token" })
    .expect(200);
  await request(app)
    .get("/api/auth/me")
    .set("authorization", `Bearer ${login.body.token}`)
    .expect(401);
});

test("test-only recovery tokens require explicit test mode", async () => {
  delete process.env.TEST_MODE;
  const disabled = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "admin@testlab.local" })
    .expect(503);
  assert.equal(disabled.body.code, "SIMULATION_DISABLED");
  await request(app)
    .post("/api/auth/register")
    .send({
      name: "Disabled",
      email: "disabled@testlab.local",
      password: "Valid123!",
    })
    .expect(503);
  process.env.TEST_MODE = "yes";
  const nonBoolean = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email: "admin@testlab.local" })
    .expect(503);
  assert.equal(nonBoolean.body.code, "SIMULATION_DISABLED");
});

test("password inputs are capped before expensive comparisons", async () => {
  const oversized = `A1!${"x".repeat(70)}`;
  await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@testlab.local", password: oversized })
    .expect(401);
  await request(app)
    .post("/api/auth/register")
    .send({
      name: "Oversized",
      email: "oversized@testlab.local",
      password: oversized,
    })
    .expect(422);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "user@testlab.local", password: "User123!" })
    .expect(200);
  await request(app)
    .post("/api/auth/change-password")
    .set("authorization", `Bearer ${login.body.token}`)
    .send({ currentPassword: oversized, newPassword: "Replacement123!" })
    .expect(400);
});

test("HTTPS application origins force secure authentication cookies", async () => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://testlab.example";
  try {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@testlab.local", password: "User123!" })
      .expect(200);
    assert.match(String(login.headers["set-cookie"]), /; Secure/i);
  } finally {
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
});

test("a second login invalidates the first device session", async () => {
  const first = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@testlab.local", password: "User123!" })
      .expect(200),
    second = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@testlab.local", password: "User123!" })
      .expect(200);
  await request(app)
    .get("/api/auth/me")
    .set("authorization", `Bearer ${first.body.token}`)
    .expect(401);
  await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: first.body.refreshToken })
    .expect(401);
  await request(app)
    .get("/api/auth/me")
    .set("authorization", `Bearer ${second.body.token}`)
    .expect(200);
});

test("reset auth epoch rejects tokens even after numeric user id reuse", async () => {
  const firstRegistration = await request(app)
    .post("/api/auth/register")
    .send({
      name: "First ID Five",
      email: "first-five@testlab.local",
      password: "Valid123!",
    })
    .expect(201);
  assert.equal(firstRegistration.body.user.id, 5);
  await request(app)
    .post("/api/auth/verify")
    .send({ token: firstRegistration.body.verificationToken })
    .expect(200);
  const firstLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: "first-five@testlab.local", password: "Valid123!" })
    .expect(200);

  reset();
  const replacement = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Replacement ID Five",
      email: "replacement-five@testlab.local",
      password: "Valid123!",
    })
    .expect(201);
  assert.equal(replacement.body.user.id, 5);
  await request(app)
    .get("/api/auth/me")
    .set("authorization", `Bearer ${firstLogin.body.token}`)
    .expect(401);
});

test("parallel failed logins increment lockout state atomically", async () => {
  const responses = await Promise.all(
    Array.from({ length: 5 }, () =>
      request(app)
        .post("/api/auth/login")
        .send({ email: "user@testlab.local", password: "wrong" }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status),
    [401, 401, 401, 401, 401],
  );
  const user = db
    .prepare("SELECT failed_attempts,locked FROM users WHERE id=2")
    .get() as { failed_attempts: number; locked: number };
  assert.equal(user.failed_attempts, 5);
  assert.equal(user.locked, 1);
});

test("concurrent password changes cannot both commit with one old password", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "user@testlab.local", password: "User123!" })
    .expect(200);
  const responses = await Promise.all([
    request(app)
      .post("/api/auth/change-password")
      .set("authorization", `Bearer ${login.body.token}`)
      .send({ currentPassword: "User123!", newPassword: "FirstChange123!" }),
    request(app)
      .post("/api/auth/change-password")
      .set("authorization", `Bearer ${login.body.token}`)
      .send({ currentPassword: "User123!", newPassword: "SecondChange123!" }),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
});

test("a rotated refresh token can still log out the current session", async () => {
  const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@testlab.local", password: "User123!" })
      .expect(200),
    refreshed = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
  await request(app)
    .post("/api/auth/logout")
    .send({ refreshToken: login.body.refreshToken })
    .expect(200);
  await request(app)
    .get("/api/auth/me")
    .set("authorization", `Bearer ${refreshed.body.token}`)
    .expect(401);
  await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: refreshed.body.refreshToken })
    .expect(401);
});

test("public login and registration endpoints are conservatively throttled", async () => {
  process.env.AUTH_RATE_LIMIT = "10";
  resetAuthRateLimits();
  try {
    for (let attempt = 0; attempt < 10; attempt += 1)
      await request(app)
        .post("/api/auth/login")
        .send({ email: "locked@testlab.local", password: "anything" })
        .expect(423);
    await request(app)
      .post("/api/auth/login")
      .send({ email: "locked@testlab.local", password: "anything" })
      .expect(429);

    for (let attempt = 0; attempt < 10; attempt += 1)
      await request(app).post("/api/auth/register").send({}).expect(422);
    await request(app).post("/api/auth/register").send({}).expect(429);
  } finally {
    delete process.env.AUTH_RATE_LIMIT;
    resetAuthRateLimits();
  }
});
