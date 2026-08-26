import { Router } from "express";

export const healthPayload = () => ({
  status: "UP" as const,
  testMode: process.env.TEST_MODE === "true",
});

export type ReadinessResult =
  | {
      statusCode: 200;
      body: { status: "READY"; checks: { database: "UP" } };
    }
  | {
      statusCode: 503;
      body: { status: "NOT_READY"; checks: { database: "DOWN" } };
    };

export function readinessResult(databaseProbe: () => void): ReadinessResult {
  try {
    databaseProbe();
    return {
      statusCode: 200,
      body: { status: "READY", checks: { database: "UP" } },
    };
  } catch {
    // Dependency errors can contain paths or connection details. The endpoint
    // intentionally exposes only the failing check name.
    return {
      statusCode: 503,
      body: { status: "NOT_READY", checks: { database: "DOWN" } },
    };
  }
}

export function createHealthRouter(databaseProbe: () => void) {
  const router = Router();
  router.get("/api/health", (_req, res) =>
    res.set("cache-control", "no-store").json(healthPayload()),
  );
  router.get("/api/ready", (_req, res) => {
    const readiness = readinessResult(databaseProbe);
    return res
      .set("cache-control", "no-store")
      .status(readiness.statusCode)
      .json(readiness.body);
  });
  return router;
}
