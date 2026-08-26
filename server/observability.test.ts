import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import {
  requestObservability,
  type RequestCompletion,
} from "./observability.js";

test("request completion logs are correlated, timed, and privacy-safe", async () => {
  const records: RequestCompletion[] = [],
    times = [100, 112.34],
    app = express();
  app.use(
    requestObservability({
      createRequestId: () => "req-deterministic",
      now: () => times.shift() ?? 112.34,
      log: (record) => records.push(record),
    }),
  );
  app.get("/probe", (_req, res) => res.status(202).json({ accepted: true }));

  const response = await request(app)
    .get("/probe?token=do-not-log")
    .set("authorization", "Bearer private-token")
    .expect(202);

  assert.equal(response.headers["x-request-id"], "req-deterministic");
  assert.equal(response.headers["server-timing"], "app;dur=12.34");
  assert.deepEqual(records, [
    {
      event: "http_request_complete",
      requestId: "req-deterministic",
      method: "GET",
      status: 202,
      durationMs: 12.34,
      aborted: false,
    },
  ]);
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes("do-not-log"), false);
  assert.equal(serialized.includes("private-token"), false);
  assert.equal(serialized.includes("authorization"), false);
});

test("failed API responses still emit safe timing and completion telemetry", async () => {
  const records: RequestCompletion[] = [],
    app = express();
  app.use(
    requestObservability({
      createRequestId: () => "req-failure",
      now: (() => {
        let value = 20;
        return () => value++;
      })(),
      log: (record) => records.push(record),
    }),
  );
  app.get("/api/failure", () => {
    throw new Error("private failure details");
  });
  app.use(
    ((error: unknown, _req: express.Request, res: express.Response) => {
      void error;
      res.status(500).json({ error: "safe" });
    }) as express.ErrorRequestHandler,
  );

  const response = await request(app)
    .get("/api/failure?apiKey=do-not-log")
    .expect(500);
  assert.match(String(response.headers["server-timing"]), /^app;dur=\d+(?:\.\d+)?$/);
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 500);
  assert.equal(JSON.stringify(records).includes("do-not-log"), false);
  assert.equal(JSON.stringify(records).includes("private failure"), false);
});
