import { Router } from "express";
import {
  advanceClock,
  ClockValidationError,
  freezeClock,
  getClockState,
  unfreezeClock,
} from "./clock.js";
import { testControlGuard } from "./testControl.js";
import { testControlAuth } from "./auth.js";
import { privateNoStore } from "./security.js";

export const clockRouter = Router();
clockRouter.use(
  "/test/clock",
  privateNoStore,
  testControlAuth,
  testControlGuard,
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

clockRouter.get("/test/clock", (_req, res) =>
  res.json({ clock: getClockState() }),
);

clockRouter.post("/test/clock", (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  try {
    let clock;
    if (body.action === "freeze" || (body.action === undefined && "at" in body))
      clock = freezeClock(body.at);
    else if (body.action === "advance")
      clock = advanceClock(body.milliseconds);
    else if (body.action === "unfreeze") clock = unfreezeClock();
    else
      throw new ClockValidationError(
        "Action must be freeze, advance, or unfreeze",
      );
    return res.json({ clock });
  } catch (error) {
    if (error instanceof ClockValidationError)
      return res.status(422).json({ error: error.message, code: error.code });
    throw error;
  }
});
