import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { createHmac, randomBytes } from "node:crypto";
import type { Socket } from "socket.io";
import type { AuthRequest, Claims, Role } from "./types.js";
import { db, getAuthEpoch } from "./db.js";
import { clockMode, nowMs } from "./clock.js";
import { currentTestRunId } from "./runContext.js";
import { runInSocketContext } from "./testRuns.js";
const secret =
  process.env.JWT_SECRET?.trim() || randomBytes(32).toString("hex");
const validRoles = new Set<Role>(["ADMIN", "USER", "VIEWER"]);
export type AuthenticatedClaims = Claims & { tokenExpiresAt: number };
type AccessTokenPayload = Claims & {
  authEpoch: string;
  type: "access";
  iat: number;
  exp: number;
  controlIat: number;
  controlExp: number;
};

const durationUnits: Record<string, number> = {
  ms: 1 / 1_000,
  s: 1,
  m: 60,
  h: 3_600,
  d: 86_400,
  w: 604_800,
  y: 31_557_600,
};

function lifetimeSeconds(expires: string | number): number {
  if (typeof expires === "number") {
    if (Number.isSafeInteger(expires) && expires > 0) return expires;
    throw new TypeError("Access-token lifetime must be a positive integer");
  }
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w|y)$/i.exec(String(expires));
  const seconds = match
    ? Math.floor(Number(match[1]) * durationUnits[match[2].toLowerCase()])
    : 0;
  if (!Number.isSafeInteger(seconds) || seconds <= 0)
    throw new TypeError("Access-token lifetime is invalid or below one second");
  return seconds;
}

const jwtPart = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

// jsonwebtoken treats a NumericDate of zero as a missing value. Building the
// fixed HS256 envelope here preserves an exact epoch timestamp; verification
// remains delegated to jsonwebtoken below.
export const sign = (user: Claims, expires: string | number = "15m") => {
  const lifetime = lifetimeSeconds(expires),
    issuedAt = Math.floor(nowMs() / 1_000),
    controlIssuedAt = Math.floor(Date.now() / 1_000),
    payload: AccessTokenPayload = {
      ...user,
      testRunId: currentTestRunId(),
      authEpoch: getAuthEpoch(),
      type: "access",
      iat: issuedAt,
      exp: issuedAt + lifetime,
      controlIat: controlIssuedAt,
      controlExp: controlIssuedAt + lifetime,
    },
    unsigned = `${jwtPart({ alg: "HS256", typ: "JWT" })}.${jwtPart(payload)}`,
    signature = createHmac("sha256", secret)
      .update(unsigned)
      .digest("base64url");
  return `${unsigned}.${signature}`;
};

export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  const encoded = cookieHeader
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!encoded) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

export function requestAccessToken(req: AuthRequest): string | undefined {
  const authorization = req.headers.authorization,
    bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearerToken || readCookie(req.headers.cookie, "access_token");
}

function authenticateAccessTokenAt(
  token: string,
  timestampMs: number,
  timeBasis: "logical" | "control",
): AuthenticatedClaims | null {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      // Validate registered time claims explicitly. jsonwebtoken falls back to
      // wall time when clockTimestamp is exactly zero.
      ignoreExpiration: true,
      ignoreNotBefore: true,
    }) as Partial<AccessTokenPayload>;
    const currentSecond = Math.floor(timestampMs / 1_000),
      issuedAt = timeBasis === "logical" ? decoded.iat : decoded.controlIat,
      expiresAt = timeBasis === "logical" ? decoded.exp : decoded.controlExp;
    if (
      decoded.type !== "access" ||
      decoded.authEpoch !== getAuthEpoch() ||
      decoded.testRunId !== currentTestRunId() ||
      !Number.isInteger(issuedAt) ||
      !Number.isInteger(expiresAt) ||
      Number(issuedAt) > currentSecond ||
      Number(expiresAt) <= currentSecond ||
      Number(expiresAt) <= Number(issuedAt) ||
      !Number.isInteger(decoded.exp) ||
      !Number.isInteger(Number(decoded.id)) ||
      Number(decoded.id) <= 0
    )
      throw Error("Invalid token type");
    const user = db
      .prepare(
        "SELECT id,email,name,role,verified,session_version,locked FROM users WHERE id=?",
      )
      .get(Number(decoded.id)) as
      | {
          id: number;
          email: string;
          name: string;
          role: Role;
          verified: number;
          session_version: number;
          locked: number;
        }
      | undefined;
    if (
      !user ||
      user.locked ||
      !user.verified ||
      !validRoles.has(user.role) ||
      Number(decoded.sessionVersion || 0) !== Number(user.session_version || 0)
    )
      throw Error("Session revoked");
    // Authorization decisions always use the current database record. A role,
    // name, or email changed after a token was issued must not remain stale for
    // the lifetime of that token.
    const claims: AuthenticatedClaims = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionVersion: Number(user.session_version || 0),
      ...(decoded.testRunId ? { testRunId: decoded.testRunId } : {}),
      tokenExpiresAt: Number(decoded.exp) * 1_000,
    };
    return claims;
  } catch {
    return null;
  }
}

export const authenticateAccessToken = (token: string) =>
  authenticateAccessTokenAt(token, nowMs(), "logical");

export const authenticateTestControlToken = (token: string) =>
  authenticateAccessTokenAt(token, Date.now(), "control");

export function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = requestAccessToken(req);
  if (!token)
    return res
      .status(401)
      .json({ error: "Authentication required", code: "AUTH_REQUIRED" });
  const user = authenticateAccessToken(token);
  if (!user)
    return res
      .status(401)
      .json({ error: "Session expired or invalid", code: "SESSION_EXPIRED" });
  req.user = user;
  return next();
}

export function testControlAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const token = requestAccessToken(req),
    user = token ? authenticateTestControlToken(token) : null;
  if (!user)
    return res.status(401).json({
      error: "Test-control session expired or invalid",
      code: "SESSION_EXPIRED",
    });
  req.user = user;
  return next();
}

export const runRoom = (testRunId = currentTestRunId()) =>
  `test-run:${testRunId || "default"}`;
export const userRoom = (userId: number, testRunId = currentTestRunId()) =>
  testRunId ? `${runRoom(testRunId)}:user:${userId}` : `user:${userId}`;

export function authenticateSocket(
  socket: Socket,
  next: (error?: Error) => void,
) {
  try {
    return runInSocketContext(socket, () => {
      const handshakeToken =
          typeof socket.handshake.auth?.token === "string"
            ? socket.handshake.auth.token
            : undefined,
        authorization = socket.handshake.headers.authorization,
        bearerToken =
          typeof authorization === "string"
            ? authorization.match(/^Bearer\s+(.+)$/i)?.[1]
            : undefined,
        token =
          handshakeToken ||
          bearerToken ||
          readCookie(socket.handshake.headers.cookie, "access_token"),
        user = token ? authenticateAccessToken(token) : null;
      if (!user) {
        const error = new Error("Authentication required");
        Object.assign(error, { data: { code: "AUTH_REQUIRED" } });
        return next(error);
      }
      socket.data.user = user;
      socket.data.accessToken = token;
      socket.data.testRunId = currentTestRunId();
      void socket.join(runRoom());
      void socket.join(userRoom(user.id));
      return next();
    });
  } catch {
    const error = new Error("Test run not found");
    Object.assign(error, { data: { code: "TEST_RUN_NOT_FOUND" } });
    return next(error);
  }
}

export function protectSocketEvents(socket: Socket) {
  const expiresAt = Number(
    (socket.data.user as AuthenticatedClaims | undefined)?.tokenExpiresAt || 0,
  );
  // A frozen logical clock does not elapse with wall time. Clock changes
  // disconnect sockets through the realtime binding, while real-mode sockets
  // retain a wall timer so an idle connection cannot outlive its JWT.
  const expirationTimer =
    clockMode() === "real"
      ? setTimeout(
          () => socket.disconnect(true),
          Math.max(0, expiresAt - nowMs()),
        )
      : undefined;
  socket.once("disconnect", () => {
    if (expirationTimer) clearTimeout(expirationTimer);
  });
  socket.use((_event, next) => {
    try {
      return runInSocketContext(socket, () => {
        const token =
            typeof socket.data.accessToken === "string"
              ? socket.data.accessToken
              : "",
          currentUser = token ? authenticateAccessToken(token) : null;
        if (!currentUser) {
          socket.disconnect(true);
          return next(new Error("Session expired or invalid"));
        }
        socket.data.user = currentUser;
        return next();
      });
    } catch {
      socket.disconnect(true);
      return next(new Error("Test run not found"));
    }
  });
}
export const roles =
  (...allowed: Role[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) =>
    req.user && allowed.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: "Insufficient role" });
