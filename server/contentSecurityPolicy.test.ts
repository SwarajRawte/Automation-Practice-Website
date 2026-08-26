import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { createContentSecurityPolicy } from "./contentSecurityPolicy.js";

test("application CSP permits only the exact automation-lab script hashes", async () => {
  const app = express();
  app.use(
    createContentSecurityPolicy({
      NODE_ENV: "production",
      SECOND_ORIGIN_URL: "https://fixtures.example.test/path",
      FRAME_ORIGINS: "not-a-url,javascript:alert(1)",
    }),
  );
  app.get("/frames", (_req, res) => res.send("ok"));

  const response = await request(app).get("/frames").expect(200),
    policy = String(response.headers["content-security-policy"]);
  assert.match(policy, /script-src 'self';/);
  assert.match(policy, /script-src-attr 'unsafe-hashes' 'sha256-/);
  assert.match(policy, /style-src 'self';/);
  assert.match(policy, /style-src-attr 'unsafe-inline'/);
  assert.match(policy, /frame-src 'self' https:\/\/fixtures\.example\.test/);
  assert.equal(policy.includes("javascript:"), false);
  assert.equal(policy.includes("not-a-url"), false);
});

test("Swagger's inline-script CSP exception is scoped to API docs", async () => {
  const app = express();
  app.use(createContentSecurityPolicy({ NODE_ENV: "test" }));
  app.get("/api/docs", (_req, res) => res.send("docs"));
  app.get("/api/private", (_req, res) => res.send("api"));

  const docsPolicy = String(
      (await request(app).get("/api/docs").expect(200)).headers[
        "content-security-policy"
      ],
    ),
    apiPolicy = String(
      (await request(app).get("/api/private").expect(200)).headers[
        "content-security-policy"
      ],
    );
  assert.match(docsPolicy, /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(apiPolicy, /script-src 'self' 'unsafe-inline'/);
  assert.equal(docsPolicy.includes("upgrade-insecure-requests"), false);
});
