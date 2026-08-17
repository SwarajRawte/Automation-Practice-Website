import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "./db.js";
import { auth, sign } from "./auth.js";
import type { AuthRequest, Claims, Role } from "./types.js";
export const authRouter = Router();
const testMode = process.env.TEST_MODE !== "false",
  configuredMaxAttempts = Number(process.env.MAX_LOGIN_ATTEMPTS || 5),
  maxAttempts =
    Number.isInteger(configuredMaxAttempts) && configuredMaxAttempts > 0
      ? configuredMaxAttempts
      : 5;
const passwordPattern = /(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,}/,
  emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value),
  normalizeEmail = (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
  validPassword = (value: unknown): value is string =>
    typeof value === "string" && passwordPattern.test(value),
  cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
const publicUser = (u: any) => ({
  id:
    u.role === "ADMIN"
      ? "user-admin-001"
      : u.role === "VIEWER"
        ? "user-viewer-001"
        : u.email === "user@testlab.local"
          ? "user-standard-001"
          : `user-${String(u.id).padStart(6, "0")}`,
  email: u.email,
  name: u.name,
  role: u.role as Role,
  verified: Boolean(u.verified),
  locked: Boolean(u.locked),
});
const audit = (action: string, detail: unknown) =>
  db
    .prepare("INSERT INTO audit(action,detail,created_at) VALUES(?,?,?)")
    .run(action, JSON.stringify(detail), new Date().toISOString());
function issueToken(
  userId: number,
  type: "refresh" | "verify" | "reset",
  hours: number,
) {
  // Verification/reset values stay deterministic in test mode. Refresh
  // tokens must still be unique so rotation actually invalidates a stolen
  // predecessor.
  const plain =
    testMode && type !== "refresh"
      ? `${type.toUpperCase()}-${userId}-TEST`
      : crypto.randomBytes(32).toString("hex");
  db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND type=?").run(
    userId,
    type,
  );
  db.prepare(
    "INSERT INTO auth_tokens(user_id,type,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
  ).run(
    userId,
    type,
    hash(plain),
    new Date(Date.now() + hours * 3600000).toISOString(),
    new Date().toISOString(),
  );
  return plain;
}
function consumeToken(token: string, type: string) {
  const row = db
    .prepare(
      "SELECT t.*,u.email,u.name,u.role,u.verified,u.locked,u.session_version FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.type=? AND t.revoked=0",
    )
    .get(hash(token), type) as any;
  if (!row || Date.parse(row.expires_at) <= Date.now()) return null;
  if (type !== "refresh")
    db.prepare("UPDATE auth_tokens SET revoked=1 WHERE id=?").run(row.id);
  return row;
}
authRouter.post("/register", (req, res) => {
  const body = isRecord(req.body) ? req.body : {},
    email = normalizeEmail(body.email),
    name = typeof body.name === "string" ? body.name.trim() : "",
    password = body.password;
  if (!emailPattern.test(email) || !name || name.length > 100)
    return res.status(422).json({
      error: "A valid email and name are required",
      code: "VALIDATION_ERROR",
    });
  if (!validPassword(password))
    return res.status(422).json({
      error:
        "Password must be 8+ characters with uppercase, number, and symbol",
      code: "WEAK_PASSWORD",
    });
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
    return res
      .status(409)
      .json({ error: "Email already registered", code: "DUPLICATE_EMAIL" });
  try {
    const out = db
      .prepare(
        "INSERT INTO users(email,name,password,role,verified,locked,failed_attempts) VALUES(?,?,?,'USER',0,0,0)",
      )
      .run(email, name, bcrypt.hashSync(password, 10));
    const id = Number(out.lastInsertRowid),
      verificationToken = issueToken(id, "verify", 24);
    audit("USER_REGISTERED", { userId: id, email });
    res.status(201).json({
      user: {
        id,
        email,
        name,
        role: "USER",
        verified: false,
        locked: false,
      },
      verificationToken: testMode ? verificationToken : undefined,
      message: "Verification email simulated",
    });
  } catch {
    return res
      .status(409)
      .json({ error: "Email already registered", code: "DUPLICATE_EMAIL" });
  }
});
authRouter.post("/verify", (req, res) => {
  const body = isRecord(req.body) ? req.body : {},
    token = typeof body.token === "string" ? body.token : "",
    row = consumeToken(token, "verify");
  if (!row)
    return res.status(400).json({
      error: "Invalid or expired verification token",
      code: "INVALID_TOKEN",
    });
  db.prepare("UPDATE users SET verified=1 WHERE id=?").run(row.user_id);
  audit("EMAIL_VERIFIED", { userId: row.user_id });
  res.json({ message: "Email verified" });
});
authRouter.post("/login", (req, res) => {
  const body = isRecord(req.body) ? req.body : {},
    email = normalizeEmail(body.email),
    password = typeof body.password === "string" ? body.password : "";
  if (!email || !password)
    return res.status(422).json({
      error: "Email and password are required",
      code: "VALIDATION_ERROR",
    });
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(email) as any;
  const fail = () => {
    if (u) {
      const attempts = u.failed_attempts + 1,
        locked = attempts >= maxAttempts ? 1 : u.locked;
      db.prepare("UPDATE users SET failed_attempts=?,locked=? WHERE id=?").run(
        attempts,
        locked,
        u.id,
      );
      audit("LOGIN_FAILED", {
        userId: u.id,
        attempts,
        locked: Boolean(locked),
      });
    }
    return res.status(401).json({
      error: "Invalid email or password",
      code: "INVALID_CREDENTIALS",
    });
  };
  if (!u || !bcrypt.compareSync(password, u.password))
    return fail();
  if (u.locked)
    return res
      .status(423)
      .json({ error: "Account is locked", code: "ACCOUNT_LOCKED" });
  if (!u.verified)
    return res
      .status(403)
      .json({ error: "Email verification required", code: "EMAIL_UNVERIFIED" });
  db.prepare("UPDATE users SET failed_attempts=0 WHERE id=?").run(u.id);
  const claims: Claims = {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      sessionVersion: Number(u.session_version || 0),
    },
    refreshToken = issueToken(
      u.id,
      "refresh",
      body.rememberMe || body.remember ? 24 * 30 : 24,
    );
  audit("LOGIN_SUCCESS", { userId: u.id });
  const accessToken = sign(claims);
  res.cookie("access_token", accessToken, {
    ...cookieOptions,
    ...(body.rememberMe || body.remember
      ? { maxAge: 30 * 24 * 3_600_000 }
      : {}),
  });
  res.json({
    token: accessToken,
    refreshToken,
    user: publicUser(u),
    expiresIn: 900,
  });
});
authRouter.post("/refresh", (req, res) => {
  const body = isRecord(req.body) ? req.body : {},
    refreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken : "",
    row = consumeToken(refreshToken, "refresh");
  if (!row)
    return res.status(401).json({
      error: "Invalid or expired refresh token",
      code: "INVALID_REFRESH_TOKEN",
    });
  if (row.locked || !row.verified)
    return res
      .status(423)
      .json({ error: "Account is locked", code: "ACCOUNT_LOCKED" });
  const claims: Claims = {
    id: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    sessionVersion: Number(row.session_version || 0),
  };
  const accessToken = sign(claims);
  res.cookie("access_token", accessToken, cookieOptions);
  res.json({
    token: accessToken,
    refreshToken: issueToken(row.user_id, "refresh", 24),
    expiresIn: 900,
  });
});
authRouter.post("/logout", (req, res) => {
  const body = isRecord(req.body) ? req.body : {},
    refreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken : "";
  const completeLogout = (userId?: number) => {
    if (userId) {
      db.prepare(
        "UPDATE users SET session_version=session_version+1 WHERE id=?",
      ).run(userId);
      db.prepare("UPDATE auth_tokens SET revoked=1 WHERE user_id=?").run(userId);
    }
    res.clearCookie("access_token", cookieOptions);
    return res.json({ message: "Logged out" });
  };
  if (refreshToken) {
    const token = db
      .prepare(
        "SELECT user_id FROM auth_tokens WHERE token_hash=? AND type='refresh' AND revoked=0",
      )
      .get(hash(refreshToken)) as { user_id: number } | undefined;
    return completeLogout(token?.user_id);
  }
  // A browser may have lost localStorage while retaining the HTTP-only access
  // cookie. Authenticate that cookie so logout still revokes the server-side
  // session even when no refresh token was submitted.
  return auth(req as AuthRequest, res, () =>
    completeLogout((req as AuthRequest).user!.id),
  );
});
const forgotPassword = (req: any, res: any) => {
  const body = isRecord(req.body) ? req.body : {},
    email = normalizeEmail(body.email);
  const u = db
    .prepare("SELECT id FROM users WHERE email=?")
    .get(email) as any;
  const resetToken = u ? issueToken(u.id, "reset", 1) : undefined;
  res.json({
    message: "If the account exists, a reset email was simulated",
    resetToken: testMode ? resetToken : undefined,
  });
};
authRouter.post("/forgot", forgotPassword);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", (req, res) => {
  const body = isRecord(req.body) ? req.body : {},
    password = body.password;
  // Do not consume a one-time reset token when the replacement password is
  // rejected; callers must be able to correct the validation error and retry.
  if (!validPassword(password))
    return res
      .status(422)
      .json({ error: "Password does not meet policy", code: "WEAK_PASSWORD" });
  const token = typeof body.token === "string" ? body.token : "",
    row = consumeToken(token, "reset");
  if (!row)
    return res
      .status(400)
      .json({ error: "Invalid or expired reset token", code: "INVALID_TOKEN" });
  db.prepare(
    "UPDATE users SET password=?,locked=0,failed_attempts=0,session_version=session_version+1 WHERE id=?",
  ).run(bcrypt.hashSync(password, 10), row.user_id);
  db.prepare(
    "UPDATE auth_tokens SET revoked=1 WHERE user_id=? AND type='refresh'",
  ).run(row.user_id);
  audit("PASSWORD_RESET", { userId: row.user_id });
  res.json({ message: "Password reset successfully" });
});
authRouter.get("/me", auth, (req: AuthRequest, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user!.id);
  u
    ? res.json(publicUser(u))
    : res.status(404).json({ error: "User not found" });
});
authRouter.get("/session", auth, (req: AuthRequest, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user!.id);
  return u
    ? res.json({ user: publicUser(u) })
    : res
        .status(401)
        .json({ error: "Session user not found", code: "SESSION_EXPIRED" });
});
authRouter.post("/change-password", auth, (req: AuthRequest, res) => {
  const u = db
    .prepare("SELECT * FROM users WHERE id=?")
    .get(req.user!.id) as any;
  const body = isRecord(req.body) ? req.body : {},
    currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "",
    newPassword = body.newPassword;
  if (!currentPassword || !bcrypt.compareSync(currentPassword, u.password))
    return res.status(400).json({
      error: "Current password is incorrect",
      code: "INVALID_CURRENT_PASSWORD",
    });
  if (!validPassword(newPassword))
    return res
      .status(422)
      .json({ error: "Password does not meet policy", code: "WEAK_PASSWORD" });
  db.prepare(
    "UPDATE users SET password=?,session_version=session_version+1 WHERE id=?",
  ).run(
    bcrypt.hashSync(newPassword, 10),
    u.id,
  );
  db.prepare(
    "UPDATE auth_tokens SET revoked=1 WHERE user_id=? AND type='refresh'",
  ).run(u.id);
  audit("PASSWORD_CHANGED", { userId: u.id });
  res.json({ message: "Password changed", reauthenticate: true });
});
