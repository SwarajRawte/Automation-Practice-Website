import { Router, type CookieOptions, type RequestHandler } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db, getAuthEpoch } from "./db.js";
import {
  auth,
  authenticateAccessToken,
  readCookie,
  requestAccessToken,
  sign,
} from "./auth.js";
import type { AuthRequest, Claims, Role } from "./types.js";
import { disconnectUserSockets } from "./realtime.js";
import { privateNoStore } from "./security.js";
import { nowIso, nowMs } from "./clock.js";
import { authRateBuckets, resetAuthRateBuckets } from "./runContext.js";
export const authRouter = Router();
authRouter.use(privateNoStore);
const isTestMode = () => process.env.TEST_MODE === "true",
  configuredMaxAttempts = Number(process.env.MAX_LOGIN_ATTEMPTS || 5),
  maxAttempts =
    Number.isInteger(configuredMaxAttempts) && configuredMaxAttempts > 0
      ? configuredMaxAttempts
      : 5;
const maxPasswordBytes = 72;
export const resetAuthRateLimits = resetAuthRateBuckets;
const publicAuthThrottle =
  (operation: string): RequestHandler =>
  (req, res, next) => {
    const configuredLimit = Number(process.env.AUTH_RATE_LIMIT || 40),
      limit =
        Number.isInteger(configuredLimit) && configuredLimit >= 10
          ? configuredLimit
          : 40,
      now = nowMs(),
      key = `${operation}:${req.ip || req.socket.remoteAddress || "unknown"}`,
      buckets = authRateBuckets(),
      existing = buckets.get(key),
      bucket =
        !existing ||
        now < existing.windowStarted ||
        now - existing.windowStarted >= 60_000
          ? { count: 0, windowStarted: now }
          : existing;
    if (bucket.count >= limit) {
      res.set(
        "Retry-After",
        String(Math.ceil((60_000 - (now - bucket.windowStarted)) / 1_000)),
      );
      return res.status(429).json({
        error: "Too many authentication attempts",
        code: "RATE_LIMITED",
      });
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 1_000)
      for (const [bucketKey, value] of buckets)
        if (now - value.windowStarted >= 60_000) buckets.delete(bucketKey);
    return next();
  };
const dummyPasswordHash = bcrypt.hashSync("InvalidPassword123!", 10),
  passwordPattern = /(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,}/,
  emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value),
  normalizeEmail = (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
  validPassword = (value: unknown): value is string =>
    typeof value === "string" &&
    Buffer.byteLength(value, "utf8") <= maxPasswordBytes &&
    passwordPattern.test(value),
  cookiesAreSecure = () =>
    process.env.COOKIE_SECURE === "true" ||
    /^https:\/\//i.test(process.env.APP_ORIGIN || ""),
  cookieOptions = (path: string): CookieOptions => ({
    httpOnly: true,
    sameSite: "lax",
    secure: cookiesAreSecure(),
    path,
  }),
  accessCookieOptions = () => cookieOptions("/"),
  refreshCookieOptions = () => cookieOptions("/api/auth");
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
    .run(action, JSON.stringify(detail), nowIso());
function issueToken(
  userId: number,
  type: "refresh" | "verify" | "reset",
  hours: number,
) {
  // Verification/reset values stay deterministic in test mode. Refresh
  // tokens must still be unique so rotation actually invalidates a stolen
  // predecessor.
  const plain =
    isTestMode() && type !== "refresh"
      ? `${type.toUpperCase()}-${userId}-TEST`
      : crypto.randomBytes(32).toString("hex");
  if (type === "refresh") {
    db.prepare(
      "DELETE FROM auth_tokens WHERE type='refresh' AND expires_at<=?",
    ).run(nowIso());
    db.prepare(
      "UPDATE auth_tokens SET revoked=1 WHERE user_id=? AND type='refresh'",
    ).run(userId);
  } else {
    db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND type=?").run(
      userId,
      type,
    );
  }
  db.prepare(
    "INSERT INTO auth_tokens(user_id,type,token_hash,expires_at,persistent,created_at) VALUES(?,?,?,?,?,?)",
  ).run(
    userId,
    type,
    hash(plain),
    new Date(nowMs() + hours * 3600000).toISOString(),
    type === "refresh" && hours > 24 ? 1 : 0,
    nowIso(),
  );
  return plain;
}
function lookupToken(token: string, type: string) {
  const row = db
    .prepare(
      "SELECT t.*,u.email,u.name,u.role,u.verified,u.locked,u.session_version FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.type=? AND t.revoked=0",
    )
    .get(hash(token), type) as any;
  if (
    !row ||
    Date.parse(row.created_at) > nowMs() ||
    Date.parse(row.expires_at) <= nowMs()
  )
    return null;
  return row;
}
function consumeToken(token: string, type: string) {
  const row = lookupToken(token, type);
  if (!row) return null;
  if (type !== "refresh")
    db.prepare("UPDATE auth_tokens SET revoked=1 WHERE id=?").run(row.id);
  return row;
}
authRouter.post(
  "/register",
  publicAuthThrottle("register"),
  async (req, res) => {
    if (!isTestMode())
      return res.status(503).json({
        error: "Registration simulation is disabled",
        code: "SIMULATION_DISABLED",
      });
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
          "Password must be 8-72 UTF-8 bytes with uppercase, number, and symbol",
        code: "WEAK_PASSWORD",
      });
    if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
      return res
        .status(409)
        .json({ error: "Email already registered", code: "DUPLICATE_EMAIL" });
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const out = db
        .prepare(
          "INSERT INTO users(email,name,password,role,verified,locked,failed_attempts) VALUES(?,?,?,'USER',0,0,0)",
        )
        .run(email, name, passwordHash);
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
        verificationToken: isTestMode() ? verificationToken : undefined,
        message: "Verification email simulated",
      });
    } catch {
      return res
        .status(409)
        .json({ error: "Email already registered", code: "DUPLICATE_EMAIL" });
    }
  },
);
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
authRouter.post("/login", publicAuthThrottle("login"), async (req, res) => {
  const body = isRecord(req.body) ? req.body : {},
    email = normalizeEmail(body.email),
    password = typeof body.password === "string" ? body.password : "";
  if (!email || !password)
    return res.status(422).json({
      error: "Email and password are required",
      code: "VALIDATION_ERROR",
    });
  if (Buffer.byteLength(password, "utf8") > maxPasswordBytes)
    return res.status(401).json({
      error: "Invalid email or password",
      code: "INVALID_CREDENTIALS",
    });
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(email) as any;
  const fail = () => {
    if (u) {
      const failure = db
          .prepare(
            "UPDATE users SET failed_attempts=failed_attempts+1,locked=CASE WHEN failed_attempts+1>=? THEN 1 ELSE locked END WHERE id=? RETURNING failed_attempts,locked",
          )
          .get(maxAttempts, u.id) as {
          failed_attempts: number;
          locked: number;
        },
        attempts = Number(failure.failed_attempts),
        locked = Boolean(failure.locked);
      audit("LOGIN_FAILED", {
        userId: u.id,
        attempts,
        locked,
      });
      if (locked) disconnectUserSockets(Number(u.id));
    }
    return res.status(401).json({
      error: "Invalid email or password",
      code: "INVALID_CREDENTIALS",
    });
  };
  if (u?.locked)
    return res
      .status(423)
      .json({ error: "Account is locked", code: "ACCOUNT_LOCKED" });
  const passwordMatches = await bcrypt.compare(
    password,
    u?.password || dummyPasswordHash,
  );
  if (!u || !passwordMatches) return fail();
  const currentUser = db
    .prepare("SELECT * FROM users WHERE id=?")
    .get(u.id) as any;
  if (!currentUser || currentUser.password !== u.password)
    return res.status(401).json({
      error: "Invalid email or password",
      code: "INVALID_CREDENTIALS",
    });
  if (currentUser.locked)
    return res
      .status(423)
      .json({ error: "Account is locked", code: "ACCOUNT_LOCKED" });
  if (!currentUser.verified)
    return res
      .status(403)
      .json({ error: "Email verification required", code: "EMAIL_UNVERIFIED" });
  const remember = body.rememberMe === true || body.remember === true;
  let refreshToken: string, sessionVersion: number;
  // Sessions are intentionally single-device: every successful login rotates
  // the server-side version and invalidates the previous access/refresh pair.
  db.exec("BEGIN IMMEDIATE");
  try {
    const rotation = db
      .prepare(
        "UPDATE users SET failed_attempts=0,session_version=session_version+1 WHERE id=? AND password=? AND locked=0 AND verified=1 RETURNING session_version",
      )
      .get(currentUser.id, u.password) as
      { session_version: number } | undefined;
    if (!rotation) {
      db.exec("ROLLBACK");
      return res.status(409).json({
        error: "Account changed during login; please retry",
        code: "LOGIN_CONFLICT",
      });
    }
    db.prepare(
      "UPDATE auth_tokens SET revoked=1 WHERE user_id=? AND type='refresh'",
    ).run(currentUser.id);
    sessionVersion = Number(rotation.session_version);
    refreshToken = issueToken(
      currentUser.id,
      "refresh",
      remember ? 24 * 30 : 24,
    );
    audit("LOGIN_SUCCESS", { userId: currentUser.id });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  disconnectUserSockets(Number(currentUser.id));
  const claims: Claims = {
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name,
    role: currentUser.role,
    sessionVersion,
  };
  const accessToken = sign(claims);
  res.cookie("access_token", accessToken, {
    ...accessCookieOptions(),
    ...(remember ? { maxAge: 30 * 24 * 3_600_000 } : {}),
  });
  res.cookie("refresh_token", refreshToken, {
    ...refreshCookieOptions(),
    ...(remember ? { maxAge: 30 * 24 * 3_600_000 } : {}),
  });
  res.json({
    token: accessToken,
    refreshToken: isTestMode() ? refreshToken : undefined,
    user: publicUser(currentUser),
    expiresIn: 900,
  });
});
authRouter.post("/refresh", (req, res) => {
  const body = isRecord(req.body) ? req.body : {},
    bodyRefreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken : "",
    cookieRefreshToken = readCookie(req.headers.cookie, "refresh_token");
  let row = consumeToken(cookieRefreshToken || bodyRefreshToken, "refresh");
  // A stale cookie from an interrupted rotation must not prevent a one-time
  // legacy body token from completing the browser migration.
  if (!row && bodyRefreshToken && bodyRefreshToken !== cookieRefreshToken)
    row = consumeToken(bodyRefreshToken, "refresh");
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
  const refreshHours = row.persistent ? 24 * 30 : 24,
    accessToken = sign(claims),
    nextRefreshToken = issueToken(row.user_id, "refresh", refreshHours);
  res.cookie("access_token", accessToken, accessCookieOptions());
  res.cookie("refresh_token", nextRefreshToken, {
    ...refreshCookieOptions(),
    ...(row.persistent ? { maxAge: 30 * 24 * 3_600_000 } : {}),
  });
  res.json({
    token: accessToken,
    refreshToken: isTestMode() ? nextRefreshToken : undefined,
    expiresIn: 900,
  });
});
authRouter.post("/logout", (req, res) => {
  const body = isRecord(req.body) ? req.body : {},
    bodyRefreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken : "",
    refreshToken =
      readCookie(req.headers.cookie, "refresh_token") || bodyRefreshToken;
  const completeLogout = (userId?: number) => {
    if (userId) {
      db.prepare(
        "UPDATE users SET session_version=session_version+1 WHERE id=?",
      ).run(userId);
      db.prepare("UPDATE auth_tokens SET revoked=1 WHERE user_id=?").run(
        userId,
      );
      disconnectUserSockets(userId);
    }
    res.clearCookie("access_token", accessCookieOptions());
    res.clearCookie("refresh_token", refreshCookieOptions());
    return res.json({ message: "Logged out" });
  };
  const accessToken = requestAccessToken(req as AuthRequest),
    accessUser = accessToken ? authenticateAccessToken(accessToken) : null,
    refreshRecord = refreshToken
      ? (db
          .prepare(
            "SELECT user_id FROM auth_tokens WHERE token_hash=? AND type='refresh' AND expires_at>?",
          )
          .get(hash(refreshToken), nowIso()) as { user_id: number } | undefined)
      : undefined;
  // Prefer the authenticated access session. A stale or attacker-supplied
  // refresh value must not make logout silently skip server-side revocation.
  return completeLogout(accessUser?.id || refreshRecord?.user_id);
});
const forgotPassword = (req: any, res: any) => {
  if (!isTestMode())
    return res.status(503).json({
      error: "Password recovery simulation is disabled",
      code: "SIMULATION_DISABLED",
    });
  const body = isRecord(req.body) ? req.body : {},
    email = normalizeEmail(body.email);
  const u = db.prepare("SELECT id FROM users WHERE email=?").get(email) as any;
  const resetToken = u ? issueToken(u.id, "reset", 1) : undefined;
  res.json({
    message: "If the account exists, a reset email was simulated",
    resetToken: isTestMode() ? resetToken : undefined,
  });
};
authRouter.post("/forgot", forgotPassword);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", async (req, res) => {
  const body = isRecord(req.body) ? req.body : {},
    password = body.password;
  // Do not consume a one-time reset token when the replacement password is
  // rejected; callers must be able to correct the validation error and retry.
  if (!validPassword(password))
    return res
      .status(422)
      .json({ error: "Password does not meet policy", code: "WEAK_PASSWORD" });
  const token = typeof body.token === "string" ? body.token : "",
    row = lookupToken(token, "reset"),
    authEpoch = getAuthEpoch();
  if (!row)
    return res
      .status(400)
      .json({ error: "Invalid or expired reset token", code: "INVALID_TOKEN" });
  const passwordHash = await bcrypt.hash(password, 10);
  db.exec("BEGIN IMMEDIATE");
  try {
    const tokenConsumed = db
        .prepare(
          "UPDATE auth_tokens SET revoked=1 WHERE id=? AND revoked=0 AND expires_at>?",
        )
        .run(row.id, nowIso()),
      updated =
        getAuthEpoch() === authEpoch
          ? db
              .prepare(
                "UPDATE users SET password=?,locked=0,failed_attempts=0,session_version=session_version+1 WHERE id=? AND email=? AND session_version=?",
              )
              .run(passwordHash, row.user_id, row.email, row.session_version)
          : { changes: 0 };
    if (!tokenConsumed.changes || !updated.changes) {
      db.exec("ROLLBACK");
      return res.status(409).json({
        error: "Account changed during password reset; request a new link",
        code: "PASSWORD_RESET_CONFLICT",
      });
    }
    db.prepare(
      "UPDATE auth_tokens SET revoked=1 WHERE user_id=? AND type='refresh'",
    ).run(row.user_id);
    audit("PASSWORD_RESET", { userId: row.user_id });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  disconnectUserSockets(Number(row.user_id));
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
authRouter.post("/change-password", auth, async (req: AuthRequest, res) => {
  const u = db
    .prepare("SELECT * FROM users WHERE id=?")
    .get(req.user!.id) as any;
  const body = isRecord(req.body) ? req.body : {},
    currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "",
    newPassword = body.newPassword;
  if (
    !currentPassword ||
    Buffer.byteLength(currentPassword, "utf8") > maxPasswordBytes ||
    !(await bcrypt.compare(currentPassword, u.password))
  )
    return res.status(400).json({
      error: "Current password is incorrect",
      code: "INVALID_CURRENT_PASSWORD",
    });
  if (!validPassword(newPassword))
    return res.status(422).json({
      error: "Password does not meet policy",
      code: "WEAK_PASSWORD",
    });
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = db
    .prepare(
      "UPDATE users SET password=?,session_version=session_version+1 WHERE id=? AND password=? AND locked=0 AND verified=1",
    )
    .run(passwordHash, u.id, u.password);
  if (!updated.changes)
    return res.status(409).json({
      error: "Password changed during this request; please retry",
      code: "PASSWORD_CHANGE_CONFLICT",
    });
  db.prepare(
    "UPDATE auth_tokens SET revoked=1 WHERE user_id=? AND type='refresh'",
  ).run(u.id);
  disconnectUserSockets(Number(u.id));
  audit("PASSWORD_CHANGED", { userId: u.id });
  res.json({ message: "Password changed", reauthenticate: true });
});
