import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import type { AuthRequest, Claims, Role } from "./types.js";
import { db } from "./db.js";
const secret = process.env.JWT_SECRET || "local-development-secret-change-me";
const validRoles = new Set<Role>(["ADMIN", "USER", "VIEWER"]);
export const sign = (user: Claims, expires = "15m") =>
  jwt.sign({ ...user, type: "access" }, secret, {
    expiresIn: expires as jwt.SignOptions["expiresIn"],
  });
export function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const cookieToken = req.headers.cookie
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("access_token="))
    ?.slice("access_token=".length);
  const authorization = req.headers.authorization,
    bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1],
    token = bearerToken || cookieToken;
  if (!token)
    return res
      .status(401)
      .json({ error: "Authentication required", code: "AUTH_REQUIRED" });
  try {
    const decoded = jwt.verify(token, secret) as Claims & { type?: string };
    if (
      decoded.type !== "access" ||
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
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionVersion: Number(user.session_version || 0),
    };
    next();
  } catch {
    return res
      .status(401)
      .json({ error: "Session expired or invalid", code: "SESSION_EXPIRED" });
  }
}
export const roles =
  (...allowed: Role[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) =>
    req.user && allowed.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: "Insufficient role" });
