import { Router } from "express";
import { db } from "./db.js";
import type { AuthRequest } from "./types.js";
import { roles } from "./auth.js";

export const formsRouter = Router();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const redactPasswords = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactPasswords);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/password/i.test(key))
      .map(([key, item]) => [key, redactPasswords(item)]),
  );
};

formsRouter.post("/forms", roles("ADMIN", "USER"), (req: AuthRequest, res) => {
  if (!req.user)
    return res
      .status(401)
      .json({ error: "Authentication required", code: "AUTH_REQUIRED" });
  const body = isRecord(req.body) ? req.body : {},
    errors: Record<string, string> = {},
    name = typeof body.name === "string" ? body.name.trim() : "",
    password = typeof body.password === "string" ? body.password : "",
    confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  if (name.length < 2 || name.length > 50)
    errors.name = "Name must contain between 2 and 50 characters";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(body.email || "")))
    errors.email = "A valid email is required";
  if (body.email === "server-error@test.local")
    errors.email = "This email is rejected by the server test scenario";
  if (password.length < 8)
    errors.password = "Password must contain at least 8 characters";
  if (password !== confirmPassword)
    errors.confirmPassword = "Passwords must match";
  if (body.quantity !== undefined && body.quantity !== "") {
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10)
      errors.quantity = "Quantity must be an integer between 1 and 10";
  }
  if (
    body.employment === "Employed" &&
    (typeof body.company !== "string" || !body.company.trim())
  )
    errors.company = "Company is required when employed";
  if (body.startDate && body.endDate) {
    const start = Date.parse(String(body.startDate)),
      end = Date.parse(String(body.endDate));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end)
      errors.endDate = "End date must not be before start date";
  }
  if (Object.keys(errors).length)
    return res.status(422).json({ error: "Form validation failed", errors });
  const safeBody = redactPasswords(body);
  const id = Number(
    db
      .prepare(
        "INSERT INTO form_submissions(user_id,data,created_at) VALUES(?,?,?)",
      )
      .run(req.user.id, JSON.stringify(safeBody), new Date().toISOString())
      .lastInsertRowid,
  );
  return res
    .status(201)
    .json({ id, data: safeBody, message: "Form submitted successfully" });
});

formsRouter.get("/forms/:id", (req: AuthRequest, res) => {
  if (!req.user)
    return res
      .status(401)
      .json({ error: "Authentication required", code: "AUTH_REQUIRED" });
  const row = db
    .prepare("SELECT * FROM form_submissions WHERE id=? AND user_id=?")
    .get(String(req.params.id), req.user.id) as
    { id: number; data: string; created_at: string } | undefined;
  return row
    ? res.json({
        id: row.id,
        data: JSON.parse(row.data),
        createdAt: row.created_at,
      })
    : res.status(404).json({ error: "Form submission not found" });
});
