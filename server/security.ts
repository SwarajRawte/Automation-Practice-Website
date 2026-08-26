import type { CorsOptions } from "cors";
import type { ErrorRequestHandler, RequestHandler, Response } from "express";

const defaultLocalOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3100",
  "http://127.0.0.1:3100",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export function configuredAllowedOrigins(
  environment: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> {
  const explicit = [
    environment.APP_ORIGIN,
    ...(environment.CORS_ORIGINS || "").split(","),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const developmentApiOrigins =
      environment.NODE_ENV === "production"
        ? []
        : [
            `http://localhost:${environment.PORT || 3100}`,
            `http://127.0.0.1:${environment.PORT || 3100}`,
          ],
    candidates = explicit.length
      ? [...explicit, ...developmentApiOrigins]
      : defaultLocalOrigins;
  return new Set(
    candidates.flatMap((value) => {
      try {
        return [new URL(value).origin];
      } catch {
        return [];
      }
    }),
  );
}

export function requestOriginAllowed(
  origin: string | string[] | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  return (
    origin === undefined ||
    (typeof origin === "string" && allowedOrigins.has(origin))
  );
}

export function createCorsOptions(
  allowedOrigins: ReadonlySet<string>,
): CorsOptions {
  return {
    credentials: true,
    origin(origin, callback) {
      callback(null, requestOriginAllowed(origin, allowedOrigins));
    },
  };
}

const forbiddenOrigin = (res: Response) =>
  res.status(403).json({
    error: "Request origin is not allowed",
    code: "ORIGIN_FORBIDDEN",
  });

export function unsafeRequestOriginGuard(
  allowedOrigins: ReadonlySet<string>,
): RequestHandler {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (origin && !allowedOrigins.has(origin)) return forbiddenOrigin(res);
    const referer = req.get("referer");
    if (referer) {
      try {
        if (!allowedOrigins.has(new URL(referer).origin))
          return forbiddenOrigin(res);
      } catch {
        return forbiddenOrigin(res);
      }
    }
    // Native API clients commonly send neither header and remain supported.
    return next();
  };
}

export const privateNoStore: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
  res.vary("Authorization");
  res.vary("Cookie");
  next();
};

export const apiErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  void _next;
  const requestedStatus = Number((error as { status?: unknown }).status),
    status =
      Number.isInteger(requestedStatus) &&
      requestedStatus >= 400 &&
      requestedStatus <= 599
        ? requestedStatus
        : 500,
    rawName = error instanceof Error ? error.name : "UnknownError",
    errorName = /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(rawName)
      ? rawName
      : "UnknownError",
    requestId = res.get("x-request-id") || "unassigned";
  // Never log parser error.body/message/stack: malformed JSON can contain
  // passwords, tokens, and other attacker-controlled request content.
  console.error("API request failed", { requestId, status, errorName });
  res.status(status).json({
    error:
      status < 500
        ? "The request body is invalid"
        : "The server could not process the request",
    code: status < 500 ? "INVALID_REQUEST" : "INTERNAL_ERROR",
    requestId,
  });
};
