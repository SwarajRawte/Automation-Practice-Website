import assert from "node:assert/strict";
import test from "node:test";
import { createShutdownHandler } from "./shutdown.js";

test("graceful shutdown closes network before resources and is idempotent", async () => {
  const order: string[] = [],
    exits: number[] = [],
    shutdown = createShutdownHandler({
      closeNetwork: async () => {
        order.push("network");
      },
      closeResources: () => {
        order.push("resources");
      },
      exit: (code) => exits.push(code),
      log: (event) => order.push(event.event),
    });

  const first = shutdown("SIGTERM"),
    second = shutdown("SIGINT");
  assert.equal(first, second);
  await first;
  assert.deepEqual(order, [
    "shutdown_started",
    "network",
    "resources",
    "shutdown_complete",
  ]);
  assert.deepEqual(exits, [0]);
});

test("graceful shutdown reports failure without logging error details", async () => {
  const events: unknown[] = [],
    exits: number[] = [],
    shutdown = createShutdownHandler({
      closeNetwork: async () => {
        throw new TypeError("database password must stay private");
      },
      closeResources: () => undefined,
      exit: (code) => exits.push(code),
      log: (event) => events.push(event),
    });

  await shutdown("SIGINT");
  assert.deepEqual(exits, [1]);
  const serialized = JSON.stringify(events);
  assert.match(serialized, /shutdown_failed/);
  assert.match(serialized, /TypeError/);
  assert.equal(serialized.includes("database password"), false);
});

test("shutdown enforces its deadline", async () => {
  let releaseNetwork!: () => void,
    force!: () => void;
  const exits: number[] = [],
    pendingNetwork = new Promise<void>((resolve) => {
      releaseNetwork = resolve;
    }),
    shutdown = createShutdownHandler({
      closeNetwork: () => pendingNetwork,
      closeResources: () => undefined,
      exit: (code) => exits.push(code),
      log: () => undefined,
      scheduleTimeout: (callback) => {
        force = callback;
        return {
          unref: () => undefined,
        } as unknown as ReturnType<typeof setTimeout>;
      },
      cancelTimeout: () => undefined,
    });

  const result = shutdown("SIGTERM");
  force();
  assert.deepEqual(exits, [1]);
  releaseNetwork();
  await result;
  assert.deepEqual(exits, [1]);
});
