import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler, Response } from "express";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

export type AuthRateBucket = { count: number; windowStarted: number };

export type RunNetworkState = {
  config: {
    delay: number;
    failureRate: number;
    offline: boolean;
    statusCode: number | null;
    rateLimit: number;
  };
  failureAccumulator: number;
  rateWindowStarted: number;
  rateWindowRequests: number;
};

export type DatabaseSnapshot = Record<
  string,
  Array<Record<string, SQLInputValue>>
>;

export type TestRunRuntime = {
  id: string;
  label?: string;
  db: DatabaseSync;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  activeRequests: number;
  clockFrozenMs: number | null;
  authRateBuckets: Map<string, AuthRateBucket>;
  network: RunNetworkState;
  snapshots: Map<string, { data: DatabaseSnapshot; bytes: number }>;
  snapshotBytes: number;
};

const runtimeStorage = new AsyncLocalStorage<TestRunRuntime>();
const defaultAuthRateBuckets = new Map<string, AuthRateBucket>();
const responseRuntime = Symbol("testRunRuntime");
type RuntimeLocals = { [responseRuntime]?: TestRunRuntime };

export const currentTestRun = () => runtimeStorage.getStore();
export const currentTestRunId = () => currentTestRun()?.id;
export const authRateBuckets = () =>
  currentTestRun()?.authRateBuckets || defaultAuthRateBuckets;
export const resetAuthRateBuckets = () => authRateBuckets().clear();

export function runInTestContext<T>(runtime: TestRunRuntime, task: () => T): T {
  runtime.lastUsedAt = Date.now();
  return runtimeStorage.run(runtime, task);
}

export function attachTestRunRuntime(
  response: Response,
  runtime: TestRunRuntime,
) {
  (response.locals as RuntimeLocals)[responseRuntime] = runtime;
}

// Multipart parsers consume a request stream created before the run-scoped
// AsyncLocalStorage context. Re-enter the selected run after such middleware
// so database work performed by the final route handler cannot fall back to
// the default database.
export const resumeTestRunContext: RequestHandler = (_req, res, next) => {
  const runtime = (res.locals as RuntimeLocals)[responseRuntime];
  return runtime ? runInTestContext(runtime, next) : next();
};

export function createNetworkState(): RunNetworkState {
  return {
    config: {
      delay: 0,
      failureRate: 0,
      offline: false,
      statusCode: null,
      rateLimit: 10,
    },
    failureAccumulator: 0,
    rateWindowStarted: Date.now(),
    rateWindowRequests: 0,
  };
}
