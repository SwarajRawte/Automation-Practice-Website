import { EventEmitter } from "node:events";
import { currentTestRun, currentTestRunId } from "./runContext.js";

export const MAX_CLOCK_ADVANCE_MS = 365 * 24 * 60 * 60 * 1_000;

export type ClockMode = "real" | "frozen";
export type ClockState = {
  mode: ClockMode;
  nowMs: number;
  now: string;
};
export type ClockChangeReason = "freeze" | "advance" | "unfreeze";

export class ClockValidationError extends Error {
  readonly code = "INVALID_CLOCK_ACTION";
}

let frozenMs: number | null = null;
const changes = new EventEmitter();
changes.setMaxListeners(50);

const currentFrozenMs = () => {
  const runtime = currentTestRun();
  return runtime ? runtime.clockFrozenMs : frozenMs;
};
const setFrozenMs = (value: number | null) => {
  const runtime = currentTestRun();
  if (runtime) runtime.clockFrozenMs = value;
  else frozenMs = value;
};

export const nowMs = () => currentFrozenMs() ?? Date.now();
export const nowIso = () => new Date(nowMs()).toISOString();
export const clockMode = (): ClockMode =>
  currentFrozenMs() === null ? "real" : "frozen";

export function getClockState(): ClockState {
  const current = nowMs();
  return {
    mode: clockMode(),
    nowMs: current,
    now: new Date(current).toISOString(),
  };
}

const isoInstant =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

function parseInstant(value: unknown): number {
  if (typeof value !== "string" || value !== value.trim())
    throw new ClockValidationError(
      "Clock time must be an ISO 8601 string with an explicit timezone",
    );
  const match = isoInstant.exec(value);
  if (!match)
    throw new ClockValidationError(
      "Clock time must be an ISO 8601 string with an explicit timezone",
    );
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]),
    hour = Number(match[4]),
    minute = Number(match[5]),
    second = Number(match[6]),
    offsetHour = match[8] === "Z" ? 0 : Number(match[10]),
    offsetMinute = match[8] === "Z" ? 0 : Number(match[11]),
    leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0),
    daysInMonth = [
      31,
      leapYear ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ][month - 1];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  )
    throw new ClockValidationError(
      "Clock time is not a valid ISO 8601 instant",
    );
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed))
    throw new ClockValidationError("Clock time is outside the supported range");
  return parsed;
}

function emitChange(reason: ClockChangeReason) {
  changes.emit("change", getClockState(), reason, currentTestRunId());
}

export function freezeClock(at: unknown): ClockState {
  setFrozenMs(parseInstant(at));
  emitChange("freeze");
  return getClockState();
}

export function advanceClock(milliseconds: unknown): ClockState {
  const frozen = currentFrozenMs();
  if (frozen === null)
    throw new ClockValidationError(
      "Clock must be frozen before it can advance",
    );
  if (
    typeof milliseconds !== "number" ||
    !Number.isSafeInteger(milliseconds) ||
    milliseconds <= 0 ||
    milliseconds > MAX_CLOCK_ADVANCE_MS
  )
    throw new ClockValidationError(
      `Advance must be a positive integer no greater than ${MAX_CLOCK_ADVANCE_MS} milliseconds`,
    );
  const advanced = frozen + milliseconds;
  if (!Number.isFinite(new Date(advanced).getTime()))
    throw new ClockValidationError(
      "Advance would exceed the supported date range",
    );
  setFrozenMs(advanced);
  emitChange("advance");
  return getClockState();
}

export function unfreezeClock(): ClockState {
  if (currentFrozenMs() !== null) {
    setFrozenMs(null);
    emitChange("unfreeze");
  }
  return getClockState();
}

export const resetClock = unfreezeClock;

export function onClockChange(
  listener: (
    state: ClockState,
    reason: ClockChangeReason,
    testRunId?: string,
  ) => void,
) {
  changes.on("change", listener);
  return () => changes.off("change", listener);
}
