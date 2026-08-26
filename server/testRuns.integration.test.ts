import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import express from "express";
import request from "supertest";
import type { Socket } from "socket.io";
import { auth, authenticateSocket, sign } from "./auth.js";
import { authRouter, resetAuthRateLimits } from "./authRoutes.js";
import { db, reset } from "./db.js";
import { freezeClock, getClockState } from "./clock.js";
import { networkConfig, updateNetworkConfig } from "./phase4Routes.js";
import { phase3Router } from "./phase3Routes.js";
import { testControlGuard } from "./testControl.js";
import {
  clearAllTestRuns,
  createTestRun,
  runInTestContextById,
  testRunContextMiddleware,
  testRunLifecycleRouter,
  testStateRouter,
} from "./testRuns.js";

const app = express();
app.use(express.json());
app.use("/api/test/runs", testRunLifecycleRouter);
app.use(testRunContextMiddleware);
app.use("/api/auth", authRouter);
app.get("/api/public-probe", (_req, res) => res.json({ available: true }));
app.use("/api", auth);
app.use("/api", testStateRouter);
app.use("/api", phase3Router);
app.get("/api/probe", (_req, res) =>
  res.json({
    products: (db.prepare("SELECT COUNT(*) count FROM products").get() as any)
      .count,
    forms: (
      db.prepare("SELECT COUNT(*) count FROM form_submissions").get() as any
    ).count,
    orders: (db.prepare("SELECT COUNT(*) count FROM orders").get() as any)
      .count,
    customProducts: (
      db.prepare("SELECT COUNT(*) count FROM products WHERE id=99").get() as any
    ).count,
  }),
);
app.post("/api/probe/product", (req, res) => {
  db.prepare("DELETE FROM products WHERE id=?").run(Number(req.body.id || 1));
  res.status(204).end();
});
app.post("/api/probe/product/custom", (_req, res) => {
  db.prepare(
    "INSERT INTO products(id,name,category,price,inventory,status,version,updated_at) VALUES(99,'Custom Product','Custom',5,9,'ACTIVE',1,'2026-01-01T00:00:00.000Z')",
  ).run();
  res.status(201).end();
});
app.post("/api/probe/form", (req: any, res) => {
  const result = db
    .prepare(
      "INSERT INTO form_submissions(user_id,data,created_at) VALUES(?,?,?)",
    )
    .run(req.user.id, "{}", "2026-01-01T00:00:00.000Z");
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
app.post("/api/test/reset", testControlGuard, (_req, res) => {
  reset();
  resetAuthRateLimits();
  res.json({ reset: true });
});

beforeEach(() => {
  process.env.TEST_MODE = "true";
  process.env.TEST_CONTROL_KEY = "isolation-key";
  delete process.env.TEST_RUN_KEY;
  clearAllTestRuns();
  reset();
});

afterEach(() => clearAllTestRuns());

const createRun = async (label: string) =>
  (
    await request(app)
      .post("/api/test/runs")
      .set("x-test-key", "isolation-key")
      .send({ label })
      .expect(201)
  ).body.run.id as string;

const login = async (runId: string) =>
  (
    await request(app)
      .post("/api/auth/login")
      .set("x-test-run-id", runId)
      .send({ email: "admin@testlab.local", password: "Admin123!" })
      .expect(200)
  ).body.token as string;

const isolated = (method: "get" | "post", path: string, runId: string) =>
  request(app)[method](path).set("x-test-run-id", runId);

test("parallel run databases and tokens cannot cross isolation boundaries", async () => {
  const first = await createRun("worker-1"),
    second = await createRun("worker-2"),
    firstToken = await login(first),
    secondToken = await login(second);

  await isolated("post", "/api/probe/product", first)
    .set("authorization", `Bearer ${firstToken}`)
    .send({ id: 1 })
    .expect(204);
  const firstProbe = await isolated("get", "/api/probe", first)
      .set("authorization", `Bearer ${firstToken}`)
      .expect(200),
    secondProbe = await isolated("get", "/api/probe", second)
      .set("authorization", `Bearer ${secondToken}`)
      .expect(200);
  assert.equal(firstProbe.body.products, 29);
  assert.equal(secondProbe.body.products, 30);

  await isolated("get", "/api/probe", second)
    .set("authorization", `Bearer ${firstToken}`)
    .expect(401);
  await request(app)
    .get("/api/probe")
    .set("authorization", `Bearer ${firstToken}`)
    .expect(401);
  await isolated("get", "/api/probe", first)
    .set("authorization", `Bearer ${secondToken}`)
    .expect(401);
});

test("multipart uploads remain inside the selected run", async () => {
  const first = await createRun("multipart-worker-1"),
    second = await createRun("multipart-worker-2"),
    firstToken = await login(first),
    secondToken = await login(second);

  await request(app)
    .post("/api/files/upload")
    .set("x-test-run-id", first)
    .set("authorization", `Bearer ${firstToken}`)
    .attach("files", Buffer.from("run-scoped multipart fixture"), {
      filename: "isolated.txt",
      contentType: "text/plain",
    })
    .expect(201);

  const firstFiles = await request(app)
      .get("/api/files")
      .set("x-test-run-id", first)
      .set("authorization", `Bearer ${firstToken}`)
      .expect(200),
    secondFiles = await request(app)
      .get("/api/files")
      .set("x-test-run-id", second)
      .set("authorization", `Bearer ${secondToken}`)
      .expect(200);
  assert.equal(firstFiles.body.data.length, 1);
  assert.equal(firstFiles.body.data[0].name, "isolated.txt");
  assert.deepEqual(secondFiles.body.data, []);
});

test("a stale HttpOnly run cookie is expired so browser navigation can recover", async () => {
  const browser = request.agent(app),
    created = await browser
      .post("/api/test/runs")
      .set("x-test-key", "isolation-key")
      .send({ label: "stale-cookie" })
      .expect(201),
    runId = created.body.run.id as string;
  await request(app)
    .delete(`/api/test/runs/${runId}`)
    .set("x-test-key", "isolation-key")
    .expect(204);
  const stale = await browser.get("/api/public-probe").expect(404);
  assert.match(String(stale.headers["set-cookie"]), /test_run=;/);
  await browser
    .get("/api/public-probe")
    .expect(200)
    .expect({ available: true });
});

test("reset, snapshots, and module reset affect only the selected run", async () => {
  const first = await createRun("worker-1"),
    second = await createRun("worker-2"),
    firstToken = await login(first),
    secondToken = await login(second),
    control = (method: "get" | "post", path: string, token = firstToken) =>
      isolated(method, path, first)
        .set("authorization", `Bearer ${token}`)
        .set("x-test-key", "isolation-key");

  await isolated("post", "/api/probe/product", first)
    .set("authorization", `Bearer ${firstToken}`)
    .send({ id: 1 })
    .expect(204);
  const capturedForm = await isolated("post", "/api/probe/form", first)
    .set("authorization", `Bearer ${firstToken}`)
    .send({})
    .expect(201);
  assert.equal(capturedForm.body.id, 1);
  runInTestContextById(first, () =>
    db.prepare("DELETE FROM form_submissions WHERE id=1").run(),
  );
  await control("post", "/api/test/snapshots")
    .send({ name: "without-product-1" })
    .expect(201);
  await isolated("post", "/api/probe/product", first)
    .set("authorization", `Bearer ${firstToken}`)
    .send({ id: 2 })
    .expect(204);
  await isolated("post", "/api/probe/form", first)
    .set("authorization", `Bearer ${firstToken}`)
    .send({})
    .expect(201)
    .expect((response) => assert.equal(response.body.id, 2));
  await control("post", "/api/test/snapshots/without-product-1/restore")
    .send({})
    .expect(200);

  // Restore revokes the token used to create the snapshot.
  await isolated("get", "/api/probe", first)
    .set("authorization", `Bearer ${firstToken}`)
    .expect(401);
  const nextFirstToken = await login(first),
    restored = await isolated("get", "/api/probe", first)
      .set("authorization", `Bearer ${nextFirstToken}`)
      .expect(200);
  assert.equal(restored.body.products, 29);

  await isolated("post", "/api/probe/form", first)
    .set("authorization", `Bearer ${nextFirstToken}`)
    .send({})
    .expect(201)
    .expect((response) => assert.equal(response.body.id, 2));
  await control("post", "/api/test/reset/forms", nextFirstToken)
    .send({})
    .expect(200);
  const formReset = await isolated("get", "/api/probe", first)
    .set("authorization", `Bearer ${nextFirstToken}`)
    .expect(200);
  assert.equal(formReset.body.forms, 0);

  await isolated("post", "/api/probe/form", first)
    .set("authorization", `Bearer ${nextFirstToken}`)
    .send({})
    .expect(201);
  await isolated("post", "/api/probe/product/custom", first)
    .set("authorization", `Bearer ${nextFirstToken}`)
    .send({})
    .expect(201);
  await control("post", "/api/test/reset/shop", nextFirstToken)
    .send({})
    .expect(200);
  const shopReset = await isolated("get", "/api/probe", first)
    .set("authorization", `Bearer ${nextFirstToken}`)
    .expect(200);
  assert.equal(shopReset.body.customProducts, 1);
  assert.equal(shopReset.body.forms, 1);
  assert.equal(shopReset.body.orders, 12);

  await control("post", "/api/test/reset/catalog", nextFirstToken)
    .send({})
    .expect(200);
  const catalogReset = await isolated("get", "/api/probe", first)
    .set("authorization", `Bearer ${nextFirstToken}`)
    .expect(200);
  assert.equal(catalogReset.body.customProducts, 0);
  assert.equal(catalogReset.body.forms, 1);
  assert.equal(catalogReset.body.orders, 12);

  await control("post", "/api/test/reset", nextFirstToken).send({}).expect(200);
  const resetProbe = await isolated("get", "/api/probe", first)
      .set("authorization", `Bearer ${await login(first)}`)
      .expect(200),
    untouched = await isolated("get", "/api/probe", second)
      .set("authorization", `Bearer ${secondToken}`)
      .expect(200);
  assert.equal(resetProbe.body.products, 30);
  assert.equal(untouched.body.products, 30);
});

const fakeSocket = (token: string, testRunId?: string) => {
  const rooms: string[] = [],
    socket = {
      handshake: {
        auth: { token, ...(testRunId ? { testRunId } : {}) },
        headers: {},
      },
      data: {},
      join(room: string) {
        rooms.push(room);
      },
    } as unknown as Socket;
  return { socket, rooms };
};

test("socket authentication binds tokens and rooms to their selected run", () => {
  const first = createTestRun("socket-1")!,
    second = createTestRun("socket-2")!,
    token = runInTestContextById(first.id, () =>
      sign({
        id: 2,
        email: "user@testlab.local",
        name: "Standard User",
        role: "USER",
        sessionVersion: 0,
      }),
    ),
    accepted = fakeSocket(token, first.id);
  let acceptedError: Error | undefined;
  authenticateSocket(accepted.socket, (error) => {
    acceptedError = error;
  });
  assert.equal(acceptedError, undefined);
  assert.deepEqual(accepted.rooms, [
    `test-run:${first.id}`,
    `test-run:${first.id}:user:2`,
  ]);

  const crossed = fakeSocket(token, second.id);
  let crossedError: Error | undefined;
  authenticateSocket(crossed.socket, (error) => {
    crossedError = error;
  });
  assert.equal(crossedError?.message, "Authentication required");

  const defaultSelection = fakeSocket(token);
  let defaultError: Error | undefined;
  authenticateSocket(defaultSelection.socket, (error) => {
    defaultError = error;
  });
  assert.equal(defaultError?.message, "Authentication required");
});

test("clock and network controls are independent for every run", () => {
  const first = createTestRun("state-1")!,
    second = createTestRun("state-2")!;
  runInTestContextById(first.id, () => {
    freezeClock("2030-01-01T00:00:00Z");
    assert.equal(updateNetworkConfig({ offline: true, rateLimit: 2 }), null);
  });
  runInTestContextById(second.id, () => {
    assert.equal(getClockState().mode, "real");
    assert.equal(networkConfig.offline, false);
    freezeClock("2040-01-01T00:00:00Z");
  });
  runInTestContextById(first.id, () => {
    assert.equal(getClockState().now, "2030-01-01T00:00:00.000Z");
    assert.equal(networkConfig.offline, true);
    reset();
    assert.equal(getClockState().mode, "real");
  });
  runInTestContextById(second.id, () => {
    assert.equal(getClockState().now, "2040-01-01T00:00:00.000Z");
    assert.equal(networkConfig.offline, false);
  });
});

test("auth module reset clears only the selected run's login throttle", async () => {
  process.env.AUTH_RATE_LIMIT = "10";
  try {
    const first = await createRun("throttled"),
      second = await createRun("unthrottled"),
      firstToken = await login(first);
    for (let attempt = 0; attempt < 9; attempt += 1)
      await isolated("post", "/api/auth/login", first)
        .send({ email: "locked@testlab.local", password: "Locked123!" })
        .expect(423);
    await isolated("post", "/api/auth/login", first)
      .send({ email: "locked@testlab.local", password: "Locked123!" })
      .expect(429);

    await isolated("post", "/api/test/reset/auth", first)
      .set("authorization", `Bearer ${firstToken}`)
      .set("x-test-key", "isolation-key")
      .send({})
      .expect(200);
    await login(first);
    await login(second);
  } finally {
    delete process.env.AUTH_RATE_LIMIT;
  }
});
