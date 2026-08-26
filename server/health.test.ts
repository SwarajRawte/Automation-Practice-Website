import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { db } from "./db.js";
import {
  createHealthRouter,
  healthPayload,
  readinessResult,
} from "./health.js";

test("deterministic seed", () => {
  assert.equal((db.prepare("SELECT COUNT(*) c FROM users").get() as any).c, 4);
  assert.equal(
    (db.prepare("SELECT name FROM products WHERE id=1").get() as any).name,
    "Test Product 001",
  );
});

test("health reports only explicitly enabled test mode", () => {
  const previous = process.env.TEST_MODE;
  delete process.env.TEST_MODE;
  assert.deepEqual(healthPayload(), { status: "UP", testMode: false });
  process.env.TEST_MODE = "true";
  assert.deepEqual(healthPayload(), { status: "UP", testMode: true });
  if (previous === undefined) delete process.env.TEST_MODE;
  else process.env.TEST_MODE = previous;
});

test("readiness distinguishes a healthy database from a failed dependency", () => {
  assert.deepEqual(readinessResult(() => undefined), {
    statusCode: 200,
    body: { status: "READY", checks: { database: "UP" } },
  });
  assert.deepEqual(
    readinessResult(() => {
      throw new Error("sensitive database location");
    }),
    {
      statusCode: 503,
      body: { status: "NOT_READY", checks: { database: "DOWN" } },
    },
  );
});

test("liveness stays up while readiness returns a sanitized dependency failure", async () => {
  const app = express();
  app.use(
    createHealthRouter(() => {
      throw new Error("do-not-expose /private/database/path");
    }),
  );

  await request(app)
    .get("/api/health")
    .expect("cache-control", /no-store/)
    .expect(200)
    .expect((response) => assert.equal(response.body.status, "UP"));
  const readiness = await request(app)
    .get("/api/ready")
    .expect("cache-control", /no-store/)
    .expect(503);
  assert.deepEqual(readiness.body, {
    status: "NOT_READY",
    checks: { database: "DOWN" },
  });
  assert.equal(readiness.text.includes("private/database"), false);
});
