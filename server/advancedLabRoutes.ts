import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { db } from "./db.js";
import { nowIso, nowMs } from "./clock.js";
import { privateNoStore } from "./security.js";
import type { AuthRequest } from "./types.js";

const OTP_LIFETIME_MS = 5 * 60_000;
const MAX_OTP_VERIFY_ATTEMPTS = 5;

type OtpRow = {
  id: number;
  code: string;
  expires_at: string;
  used: number;
  failed_attempts: number;
};

const isSixDigitCode = (value: unknown): value is string =>
  typeof value === "string" && /^\d{6}$/.test(value);

function sameCode(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createAdvancedLabRouter() {
  const router = Router();
  router.use("/advanced/mailbox", privateNoStore);

  router.get("/advanced/events", (req: AuthRequest, res) => {
    const requestedLimit = Number(req.query.limit ?? 4);
    if (
      !Number.isInteger(requestedLimit) ||
      requestedLimit < 1 ||
      requestedLimit > 10
    )
      return res.status(422).json({
        error: "Event limit must be an integer between 1 and 10",
        code: "INVALID_EVENT_LIMIT",
      });

    const streamId = randomUUID();
    let sequence = 0;
    let timer: NodeJS.Timeout | undefined;
    let closed = false;

    res.status(200);
    res.set({
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.flushHeaders();
    res.write("retry: 1000\n");
    res.write(
      `event: connected\ndata: ${JSON.stringify({ streamId, connected: true })}\n\n`,
    );

    const close = () => {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      res.end();
    };
    const emit = () => {
      if (closed) return;
      sequence += 1;
      res.write(`id: ${sequence}\n`);
      res.write("event: lab-message\n");
      res.write(
        `data: ${JSON.stringify({ sequence, kind: sequence % 2 ? "build" : "test", at: nowIso(), userId: req.user!.id })}\n\n`,
      );
      if (sequence >= requestedLimit) close();
    };

    // A one-event stream completes synchronously for fast API tests. Longer
    // streams demonstrate incremental delivery, reconnection, and cleanup.
    emit();
    if (!closed) timer = setInterval(emit, 500);
    res.on("close", close);
    return undefined;
  });

  router.post("/advanced/mailbox/code", (req: AuthRequest, res) => {
    const createdAt = nowIso();
    const expiresAt = new Date(nowMs() + OTP_LIFETIME_MS).toISOString();
    const code = String(randomInt(100_000, 1_000_000));
    db.prepare(
      "UPDATE lab_otp_messages SET used=1 WHERE user_id=? AND used=0",
    ).run(req.user!.id);
    db.prepare(
      "INSERT INTO lab_otp_messages(user_id,code,expires_at,used,created_at) VALUES(?,?,?,0,?)",
    ).run(req.user!.id, code, expiresAt, createdAt);
    return res.status(201).json({
      message: "A sign-in code was delivered to the mock mailbox",
      expiresAt,
    });
  });

  router.get("/advanced/mailbox", (req: AuthRequest, res) => {
    const data = db
      .prepare(
        "SELECT id,code,expires_at expiresAt,used,created_at createdAt FROM lab_otp_messages WHERE user_id=? ORDER BY id DESC LIMIT 10",
      )
      .all(req.user!.id)
      .map((row) => ({
        ...(row as Record<string, unknown>),
        used: Boolean((row as { used: number }).used),
      }));
    return res.json({ data, total: data.length });
  });

  router.post("/advanced/mailbox/verify", (req: AuthRequest, res) => {
    const code = req.body?.code;
    if (!isSixDigitCode(code))
      return res.status(422).json({
        error: "Enter the six-digit code",
        code: "INVALID_OTP",
      });
    const message = db
      .prepare(
        "SELECT id,code,expires_at,used,failed_attempts FROM lab_otp_messages WHERE user_id=? ORDER BY id DESC LIMIT 1",
      )
      .get(req.user!.id) as OtpRow | undefined;
    if (message && message.failed_attempts >= MAX_OTP_VERIFY_ATTEMPTS)
      return res.status(429).json({
        error: "Too many verification attempts; request a new code",
        code: "OTP_ATTEMPTS_EXCEEDED",
      });
    if (
      !message ||
      message.used ||
      Date.parse(message.expires_at) <= nowMs() ||
      !sameCode(message.code, code)
    ) {
      if (message)
        db.prepare(
          "UPDATE lab_otp_messages SET failed_attempts=failed_attempts+1 WHERE id=?",
        ).run(message.id);
      return res.status(422).json({
        error: "The code is invalid, expired, or already used",
        code: "INVALID_OTP",
      });
    }
    const consumed = db
      .prepare(
        "UPDATE lab_otp_messages SET used=1 WHERE id=? AND used=0 AND failed_attempts<?",
      )
      .run(message.id, MAX_OTP_VERIFY_ATTEMPTS);
    if (!consumed.changes)
      return res.status(422).json({
        error: "The code is invalid, expired, or already used",
        code: "INVALID_OTP",
      });
    return res.json({ verified: true, message: "Sign-in code verified" });
  });

  router.delete("/advanced/mailbox", (req: AuthRequest, res) => {
    db.prepare("DELETE FROM lab_otp_messages WHERE user_id=?").run(
      req.user!.id,
    );
    return res.status(204).end();
  });

  return router;
}
