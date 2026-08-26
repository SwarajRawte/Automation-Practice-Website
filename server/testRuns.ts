import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import type { Socket } from "socket.io";
import {
  captureDatabaseSnapshot,
  createDatabase,
  RESET_MODULES,
  resetModule,
  restoreDatabaseSnapshot,
  type ResetModule,
} from "./db.js";
import {
  attachTestRunRuntime,
  createNetworkState,
  currentTestRun,
  resetAuthRateBuckets,
  runInTestContext,
  type DatabaseSnapshot,
  type TestRunRuntime,
} from "./runContext.js";
import { testControlGuard } from "./testControl.js";
import { privateNoStore } from "./security.js";

const runs = new Map<string, TestRunRuntime>();
const deletionListeners = new Set<(testRunId: string) => void>();
const invalidationListeners = new Set<(testRunId: string) => void>();
const runIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const snapshotNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function readCookie(header: string | undefined, name: string) {
  const value = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function databaseSnapshotBytes(snapshot: DatabaseSnapshot) {
  let bytes = 0;
  for (const rows of Object.values(snapshot))
    for (const row of rows)
      for (const value of Object.values(row)) {
        if (value === null) continue;
        if (typeof value === "string") bytes += Buffer.byteLength(value);
        else if (ArrayBuffer.isView(value)) bytes += value.byteLength;
        else bytes += 8;
      }
  return bytes;
}

const configuredInteger = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
};

const maxRuns = () => configuredInteger("TEST_RUN_MAX", 16, 1, 64);
const runTtlMs = () =>
  configuredInteger("TEST_RUN_TTL_MS", 60 * 60_000, 60_000, 24 * 60 * 60_000);

const actors = {
  admin: {
    email: "admin@testlab.local",
    password: "Admin123!",
    role: "ADMIN",
  },
  user: {
    email: "user@testlab.local",
    password: "User123!",
    role: "USER",
  },
  viewer: {
    email: "viewer@testlab.local",
    password: "Viewer123!",
    role: "VIEWER",
  },
  locked: {
    email: "locked@testlab.local",
    password: "Locked123!",
    role: "USER",
  },
} as const;

const publicRun = (runtime: TestRunRuntime) => ({
  id: runtime.id,
  ...(runtime.label ? { label: runtime.label } : {}),
  createdAt: new Date(runtime.createdAt).toISOString(),
  lastUsedAt: new Date(runtime.lastUsedAt).toISOString(),
  expiresAt: new Date(runtime.expiresAt).toISOString(),
});

function closeRuntime(runtime: TestRunRuntime) {
  for (const listener of deletionListeners) listener(runtime.id);
  runs.delete(runtime.id);
  runtime.db.close();
}

export function onTestRunDeleted(listener: (testRunId: string) => void) {
  deletionListeners.add(listener);
  return () => deletionListeners.delete(listener);
}

export function onTestRunInvalidated(listener: (testRunId: string) => void) {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

function notifyTestRunInvalidated(testRunId: string) {
  for (const listener of invalidationListeners) listener(testRunId);
}

export function cleanupExpiredTestRuns(now = Date.now()) {
  for (const runtime of runs.values())
    if (runtime.activeRequests === 0 && now >= runtime.expiresAt)
      closeRuntime(runtime);
}

const cleanupTimer = setInterval(cleanupExpiredTestRuns, 30_000);
cleanupTimer.unref();

export function getTestRun(id: string | undefined) {
  if (!id || !runIdPattern.test(id)) return undefined;
  const runtime = runs.get(id);
  if (!runtime) return undefined;
  const now = Date.now();
  if (runtime.activeRequests === 0 && now >= runtime.expiresAt) {
    closeRuntime(runtime);
    return undefined;
  }
  runtime.lastUsedAt = now;
  runtime.expiresAt = now + runTtlMs();
  return runtime;
}

export function createTestRun(label?: string) {
  cleanupExpiredTestRuns();
  if (runs.size >= maxRuns()) return null;
  const now = Date.now(),
    id = randomUUID(),
    runtime: TestRunRuntime = {
      id,
      ...(label ? { label } : {}),
      db: createDatabase(),
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now + runTtlMs(),
      activeRequests: 0,
      clockFrozenMs: null,
      authRateBuckets: new Map(),
      network: createNetworkState(),
      snapshots: new Map(),
      snapshotBytes: 0,
    };
  runs.set(id, runtime);
  return runtime;
}

export function deleteTestRun(id: string) {
  const runtime = runs.get(id);
  if (!runtime) return false;
  if (runtime.activeRequests > 0) return false;
  closeRuntime(runtime);
  return true;
}

export function clearAllTestRuns() {
  for (const runtime of [...runs.values()]) closeRuntime(runtime);
}

export const listTestRuns = () => [...runs.values()].map(publicRun);

function keyOnlyTestGuard(req: Request, res: Response, next: NextFunction) {
  if (process.env.TEST_MODE !== "true")
    return res.status(404).json({ error: "Test controls disabled" });
  const configuredKey =
    process.env.TEST_RUN_KEY?.trim() || process.env.TEST_CONTROL_KEY?.trim();
  if (!configuredKey || req.get("x-test-key") !== configuredKey)
    return res.status(403).json({ error: "Invalid test control key" });
  return next();
}

const testRunCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure:
    process.env.COOKIE_SECURE === "true" ||
    /^https:\/\//i.test(process.env.APP_ORIGIN || ""),
  path: "/",
});

export const testRunLifecycleRouter = Router();
testRunLifecycleRouter.use(privateNoStore);
testRunLifecycleRouter.use(keyOnlyTestGuard);

testRunLifecycleRouter.post("/", (req, res) => {
  const label =
    typeof req.body?.label === "string" ? req.body.label.trim() : undefined;
  if (label && label.length > 80)
    return res.status(422).json({
      error: "Run label must be at most 80 characters",
      code: "INVALID_RUN_LABEL",
    });
  const runtime = createTestRun(label);
  if (!runtime)
    return res.status(429).json({
      error: "Maximum active test runs reached",
      code: "TEST_RUN_LIMIT_REACHED",
    });
  res.cookie("test_run", runtime.id, testRunCookieOptions());
  return res.status(201).json({ run: publicRun(runtime), actors });
});

testRunLifecycleRouter.get("/", (_req, res) => {
  cleanupExpiredTestRuns();
  return res.json({ data: listTestRuns(), total: runs.size });
});

testRunLifecycleRouter.delete("/:id", (req, res) => {
  const runtime = runs.get(req.params.id);
  if (!runtime)
    return res
      .status(404)
      .json({ error: "Test run not found", code: "TEST_RUN_NOT_FOUND" });
  if (runtime.activeRequests > 0)
    return res.status(409).json({
      error: "Test run still has active requests",
      code: "TEST_RUN_IN_USE",
    });
  closeRuntime(runtime);
  if (readCookie(req.headers.cookie, "test_run") === req.params.id)
    res.clearCookie("test_run", testRunCookieOptions());
  return res.status(204).end();
});

export const testRunContextMiddleware: RequestHandler = (req, res, next) => {
  if (process.env.TEST_MODE !== "true") return next();
  const headerRunId = req.get("x-test-run-id"),
    cookieRunId = readCookie(req.headers.cookie, "test_run"),
    id = headerRunId || cookieRunId;
  if (!id) return next();
  const runtime = getTestRun(id);
  if (!runtime) {
    // An HttpOnly selection cannot be repaired by application JavaScript. Do
    // not fall back during this request, but expire a stale cookie so the next
    // navigation can recover to the default application state.
    if (!headerRunId && cookieRunId)
      res.clearCookie("test_run", testRunCookieOptions());
    return res
      .status(404)
      .json({ error: "Test run not found", code: "TEST_RUN_NOT_FOUND" });
  }
  runtime.activeRequests += 1;
  attachTestRunRuntime(res, runtime);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    runtime.activeRequests = Math.max(0, runtime.activeRequests - 1);
    runtime.lastUsedAt = Date.now();
    runtime.expiresAt = runtime.lastUsedAt + runTtlMs();
  };
  res.once("finish", release);
  res.once("close", release);
  return runInTestContext(runtime, next);
};

export function socketTestRunId(socket: Socket) {
  const authId = socket.handshake.auth?.testRunId,
    header = socket.handshake.headers["x-test-run-id"];
  return (
    (typeof authId === "string" ? authId : undefined) ||
    (typeof header === "string" ? header : undefined) ||
    readCookie(socket.handshake.headers.cookie, "test_run")
  );
}

export function runInSocketContext<T>(socket: Socket, task: () => T): T {
  const id =
    typeof socket.data.testRunId === "string"
      ? socket.data.testRunId
      : socketTestRunId(socket);
  if (!id) return task();
  const runtime = getTestRun(id);
  if (!runtime) throw new Error("Test run not found");
  return runInTestContext(runtime, task);
}

export function runInTestContextById<T>(id: string, task: () => T): T {
  const runtime = getTestRun(id);
  if (!runtime) throw new Error("Test run not found");
  return runInTestContext(runtime, task);
}

export const testStateRouter = Router();
testStateRouter.use("/test", testControlGuard);

testStateRouter.get("/test/snapshots", (_req, res) => {
  const runtime = currentTestRun();
  if (!runtime)
    return res.status(409).json({
      error: "A test run must be selected",
      code: "TEST_RUN_REQUIRED",
    });
  return res.json({ data: [...runtime.snapshots.keys()] });
});

testStateRouter.post("/test/snapshots", (req, res) => {
  const runtime = currentTestRun(),
    name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!runtime)
    return res.status(409).json({
      error: "A test run must be selected",
      code: "TEST_RUN_REQUIRED",
    });
  if (!snapshotNamePattern.test(name))
    return res.status(422).json({
      error:
        "Snapshot name must use 1-64 letters, numbers, underscores, or hyphens",
      code: "INVALID_SNAPSHOT_NAME",
    });
  if (!runtime.snapshots.has(name) && runtime.snapshots.size >= 8)
    return res.status(429).json({
      error: "Maximum snapshots reached for this run",
      code: "SNAPSHOT_LIMIT_REACHED",
    });
  const data = captureDatabaseSnapshot(runtime.db),
    bytes = databaseSnapshotBytes(data),
    previousBytes = runtime.snapshots.get(name)?.bytes || 0,
    maxBytes = configuredInteger(
      "TEST_RUN_SNAPSHOT_MAX_BYTES",
      16 * 1024 * 1024,
      1024 * 1024,
      128 * 1024 * 1024,
    );
  if (runtime.snapshotBytes - previousBytes + bytes > maxBytes)
    return res.status(413).json({
      error: "Snapshot storage limit reached for this run",
      code: "SNAPSHOT_STORAGE_LIMIT_REACHED",
    });
  runtime.snapshots.set(name, { data, bytes });
  runtime.snapshotBytes = runtime.snapshotBytes - previousBytes + bytes;
  return res.status(201).json({ name, bytes });
});

testStateRouter.post("/test/snapshots/:name/restore", (req, res) => {
  const runtime = currentTestRun(),
    snapshot = runtime?.snapshots.get(req.params.name);
  if (!runtime)
    return res.status(409).json({
      error: "A test run must be selected",
      code: "TEST_RUN_REQUIRED",
    });
  if (!snapshot)
    return res
      .status(404)
      .json({ error: "Snapshot not found", code: "SNAPSHOT_NOT_FOUND" });
  restoreDatabaseSnapshot(snapshot.data, runtime.db);
  notifyTestRunInvalidated(runtime.id);
  return res.json({ name: req.params.name, restored: true });
});

testStateRouter.delete("/test/snapshots/:name", (req, res) => {
  const runtime = currentTestRun(),
    snapshot = runtime?.snapshots.get(req.params.name);
  if (!runtime || !snapshot)
    return res
      .status(404)
      .json({ error: "Snapshot not found", code: "SNAPSHOT_NOT_FOUND" });
  runtime.snapshots.delete(req.params.name);
  runtime.snapshotBytes = Math.max(0, runtime.snapshotBytes - snapshot.bytes);
  return res.status(204).end();
});

testStateRouter.post("/test/reset/:module", (req, res) => {
  const module = req.params.module as ResetModule;
  if (!RESET_MODULES.includes(module))
    return res.status(422).json({
      error: `Module must be one of: ${RESET_MODULES.join(", ")}`,
      code: "INVALID_RESET_MODULE",
    });
  resetModule(module);
  if (module === "auth") resetAuthRateBuckets();
  const runtime = currentTestRun();
  if (runtime) notifyTestRunInvalidated(runtime.id);
  return res.json({ module, reset: true });
});
