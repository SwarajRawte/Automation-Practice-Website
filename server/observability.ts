import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export type RequestCompletion = {
  event: "http_request_complete";
  requestId: string;
  method: string;
  status: number;
  durationMs: number;
  aborted: boolean;
};

type RequestObservabilityOptions = {
  createRequestId?: () => string;
  now?: () => number;
  log?: (record: RequestCompletion) => void;
};

const defaultLog = (record: RequestCompletion) =>
  console.info(JSON.stringify(record));

export function requestObservability(
  options: RequestObservabilityOptions = {},
): RequestHandler {
  const createRequestId =
      options.createRequestId || (() => `req-${randomUUID()}`),
    now = options.now || (() => performance.now()),
    log = options.log || defaultLog;

  return (req, res, next) => {
    const requestId = createRequestId(),
      startedAt = now();
    let completed = false;
    res.set("x-request-id", requestId);

    // Server-Timing has to be finalized before Node commits response headers.
    // writeHead is the single path used by explicit and implicit headers, so
    // this reports application processing time-to-headers (also useful for
    // streaming responses whose full duration cannot be known up front).
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = ((...arguments_: Parameters<typeof res.writeHead>) => {
      if (!res.headersSent) {
        const headerDuration = Math.max(0, now() - startedAt);
        res.setHeader(
          "Server-Timing",
          `app;dur=${Number(headerDuration.toFixed(2))}`,
        );
      }
      return originalWriteHead(...arguments_);
    }) as typeof res.writeHead;

    const complete = (aborted: boolean) => {
      if (completed) return;
      completed = true;
      const elapsed = Math.max(0, now() - startedAt);
      log({
        event: "http_request_complete",
        requestId,
        method: req.method,
        status: aborted ? 499 : res.statusCode,
        durationMs: Number(elapsed.toFixed(2)),
        aborted,
      });
    };

    res.once("finish", () => complete(false));
    res.once("close", () => complete(!res.writableEnded));
    next();
  };
}
