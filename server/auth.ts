import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import type { Socket } from "socket.io";
import type { AuthRequest, Claims, Role } from "./types.js";
import { db, getAuthEpoch } from "./db.js";
const secret =
  process.env.JWT_SECRET?.trim() || randomBytes(32).toString("hex");
const validRoles = new Set<Role>(["ADMIN", "USER", "VIEWER"]);
export type AuthenticatedClaims = Claims & { tokenExpiresAt: number };
export const sign = (user: Claims, expires = "15m") =>
  jwt.sign({ ...user, authEpoch: getAuthEpoch(), type: "access" }, secret, {
    algorithm: "HS256",
    expiresIn: expires as jwt.SignOptions["expiresIn"],
  });

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

export function authenticateAccessToken(
  token: string,
): AuthenticatedClaims | null {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    }) as Claims & { type?: string; exp?: number; authEpoch?: string };
    if (
      decoded.type !== "access" ||
      decoded.authEpoch !== getAuthEpoch() ||
      !Number.isInteger(decoded.exp) ||
      !Number.isInteger(Number(decoded.id)) ||
      Number(decoded.id) <= 0
    )
      throw Error("Invalid token type");
    const user = db
      .prepare(
        "SELECT id,email,name,role,verified,session_version,locked FROM users WHERE id=?",
      )
      .get(decoded.id) as
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
      tokenExpiresAt: Number(decoded.exp) * 1_000,
    };
    return claims;
  } catch {
    return null;
  }
}

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

export const userRoom = (userId: number) => `user:${userId}`;

export function authenticateSocket(
  socket: Socket,
  next: (error?: Error) => void,
) {
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
  void socket.join(userRoom(user.id));
  return next();
}

export function protectSocketEvents(socket: Socket) {
  const expiresAt = Number(
      (socket.data.user as AuthenticatedClaims | undefined)?.tokenExpiresAt ||
        0,
    ),
    expirationTimer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, expiresAt - Date.now()),
    );
  socket.once("disconnect", () => clearTimeout(expirationTimer));
  socket.use((_event, next) => {
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
}
export const roles =
  (...allowed: Role[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) =>
    req.user && allowed.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: "Insufficient role" });
