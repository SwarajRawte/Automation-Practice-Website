import test from "node:test";
import assert from "node:assert/strict";
import { db } from "./db.js";
import { healthPayload } from "./health.js";

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
