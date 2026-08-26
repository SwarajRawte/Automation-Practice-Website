import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import {
  apiErrorHandler,
  configuredAllowedOrigins,
  privateNoStore,
  unsafeRequestOriginGuard,
} from "./security.js";

test("development origin configuration includes the API's exact Swagger origin", () => {
  const allowed = configuredAllowedOrigins({
    NODE_ENV: "development",
    APP_ORIGIN: "http://localhost:5173",
    PORT: "3199",
  });
  assert.equal(allowed.has("http://localhost:5173"), true);
  assert.equal(allowed.has("http://localhost:3199"), true);
  assert.equal(allowed.has("http://127.0.0.1:3199"), true);
  assert.equal(allowed.has("http://hostile.test"), false);

  const production = configuredAllowedOrigins({
    NODE_ENV: "production",
    APP_ORIGIN: "https://testlab.example",
    PORT: "3199",
  });
  assert.deepEqual([...production], ["https://testlab.example"]);
});

test("unsafe requests enforce exact Origin and Referer allowlists", async () => {
  const app = express(),
    allowed = new Set(["https://allowed.test"]);
  app.use(unsafeRequestOriginGuard(allowed));
  app.post("/mutate", (_req, res) => res.json({ changed: true }));

  await request(app)
    .post("/mutate")
    .set("Origin", "https://allowed.test")
    .expect(200);
  await request(app)
    .post("/mutate")
    .set("Referer", "https://allowed.test/page")
    .expect(200);
  await request(app).post("/mutate").expect(200);
  for (const [header, value] of [
    ["Origin", "https://hostile.test"],
    ["Origin", "https://allowed.test/"],
    ["Referer", "https://hostile.test/page"],
  ])
    await request(app)
      .post("/mutate")
      .set(header, value)
      .expect(403)
      .expect((response) =>
        assert.equal(response.body.code, "ORIGIN_FORBIDDEN"),
      );
});

test("private authenticated responses opt out of shared caching", async () => {
  const app = express();
  app.get("/api/private", privateNoStore, (_req, res) =>
    res.json({ private: true }),
  );
  const response = await request(app).get("/api/private").expect(200);
  assert.equal(response.headers["cache-control"], "private, no-store");
  assert.match(response.headers.vary, /Authorization/);
  assert.match(response.headers.vary, /Cookie/);
});

test("malformed secret JSON is correlated without logging request content", async () => {
  const app = express(),
    captured: unknown[][] = [],
    originalConsoleError = console.error;
  app.use((_req, res, next) => {
    res.set("x-request-id", "req-safe-parser");
    next();
  });
  app.use(express.json());
  app.post("/api/private", (_req, res) => res.json({ ok: true }));
  app.use("/api", apiErrorHandler);
  console.error = (...values: unknown[]) => captured.push(values);
  try {
    const response = await request(app)
      .post("/api/private")
      .set("content-type", "application/json")
      .send('{"password":"do-not-log",')
      .expect(400);
    assert.equal(response.body.requestId, "req-safe-parser");
    assert.equal(JSON.stringify(captured).includes("do-not-log"), false);
    assert.match(JSON.stringify(captured), /req-safe-parser/);
  } finally {
    console.error = originalConsoleError;
  }
});
