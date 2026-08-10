import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { authRouter } from "./authRoutes.js";
import { reset, db } from "./db.js";
const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
beforeEach(() => reset());
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
  assert.match(String(login.headers["set-cookie"]), /access_token=/);
  await request(app)
    .get("/api/auth/me")
    .set("authorization", `Bearer ${login.body.token}`)
    .expect(200)
    .expect((r) => assert.equal(r.body.email, "admin@testlab.local"));
  const refreshed = await request(app)
    .post("/api/auth/refresh")
    .send({ refreshToken: login.body.refreshToken })
    .expect(200);
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
  await request(app)
    .post("/api/auth/register")
    .send({
      name: "Duplicate",
      email: "admin@testlab.local",
      password: "Valid123!",
    })
    .expect(409);
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
  assert.ok(
    (
      db
        .prepare("SELECT COUNT(*) c FROM audit WHERE action='PASSWORD_CHANGED'")
        .get() as { c: number }
    ).c === 1,
  );
});
