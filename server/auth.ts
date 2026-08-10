import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import type { AuthRequest, Claims, Role } from "./types.js";
import { db } from "./db.js";
const secret = process.env.JWT_SECRET || "local-development-secret-change-me";
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
  const token =
    req.headers.authorization?.replace("Bearer ", "") || cookieToken;
  if (!token)
    return res
      .status(401)
      .json({ error: "Authentication required", code: "AUTH_REQUIRED" });
  try {
    const decoded = jwt.verify(token, secret) as Claims & { type?: string };
    if (decoded.type && decoded.type !== "access")
      throw Error("Invalid token type");
    const user = db
      .prepare("SELECT session_version,locked FROM users WHERE id=?")
      .get(decoded.id) as
      { session_version: number; locked: number } | undefined;
    if (
      !user ||
      user.locked ||
      Number(decoded.sessionVersion || 0) !== Number(user.session_version || 0)
    )
      throw Error("Session revoked");
    req.user = decoded;
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
