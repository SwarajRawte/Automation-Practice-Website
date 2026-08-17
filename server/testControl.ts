import type { NextFunction, Response } from "express";
import type { AuthRequest } from "./types.js";

export function testControlGuard(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (process.env.TEST_MODE === "false")
    return res.status(404).json({ error: "Test controls disabled" });
  if (
    req.get("x-test-key") !==
    (process.env.TEST_CONTROL_KEY || "testlab-control")
  )
    return res.status(403).json({ error: "Invalid test control key" });
  if (req.user?.role !== "ADMIN")
    return res.status(403).json({ error: "Admin role required" });
  return next();
}
