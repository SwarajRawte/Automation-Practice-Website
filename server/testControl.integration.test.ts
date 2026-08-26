import test, { beforeEach } from "node:test";
import express from "express";
import request from "supertest";
import { auth } from "./auth.js";
import { authRouter } from "./authRoutes.js";
import { reset } from "./db.js";
import { testControlGuard } from "./testControl.js";

const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
app.post("/api/test/protected", auth, testControlGuard, (_req, res) =>
  res.json({ allowed: true }),
);

beforeEach(() => {
  delete process.env.TEST_MODE;
  delete process.env.TEST_CONTROL_KEY;
  reset();
});

const login = async (email: string, password: string) =>
  (
    await request(app)
      .post("/api/auth/login")
      .send({ email, password })
      .expect(200)
  ).body.token as string;

test("test controls require both the configured key and an admin role", async () => {
  process.env.TEST_MODE = "true";
  process.env.TEST_CONTROL_KEY = "testlab-control";
  const userToken = await login("user@testlab.local", "User123!");
  await request(app)
    .post("/api/test/protected")
    .set("authorization", `Bearer ${userToken}`)
    .set("x-test-key", "testlab-control")
    .send({})
    .expect(403);
  const adminToken = await login("admin@testlab.local", "Admin123!");
  await request(app)
    .post("/api/test/protected")
    .set("authorization", `Bearer ${adminToken}`)
    .set("x-test-key", "wrong")
    .send({})
    .expect(403);
  await request(app)
    .post("/api/test/protected")
    .set("authorization", `Bearer ${adminToken}`)
    .set("x-test-key", "testlab-control")
    .send({})
    .expect(200);
});

test("test controls are hidden unless test mode is explicitly true", async () => {
  const adminToken = await login("admin@testlab.local", "Admin123!");
  await request(app)
    .post("/api/test/protected")
    .set("authorization", `Bearer ${adminToken}`)
    .set("x-test-key", "testlab-control")
    .send({})
    .expect(404);
  process.env.TEST_MODE = "yes";
  await request(app)
    .post("/api/test/protected")
    .set("authorization", `Bearer ${adminToken}`)
    .set("x-test-key", "testlab-control")
    .send({})
    .expect(404);
});

test("test controls fail closed without a configured key", async () => {
  process.env.TEST_MODE = "true";
  const adminToken = await login("admin@testlab.local", "Admin123!");
  await request(app)
    .post("/api/test/protected")
    .set("authorization", `Bearer ${adminToken}`)
    .set("x-test-key", "testlab-control")
    .send({})
    .expect(403);
});
