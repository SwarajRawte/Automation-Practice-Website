import { Router } from "express";
import { db } from "./db.js";

export const formsRouter = Router();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

formsRouter.post("/forms", (req, res) => {
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
  const id = Number(
    db
      .prepare("INSERT INTO form_submissions(data,created_at) VALUES(?,?)")
      .run(JSON.stringify(body), new Date().toISOString()).lastInsertRowid,
  );
  return res
    .status(201)
    .json({ id, data: body, message: "Form submitted successfully" });
});

formsRouter.get("/forms/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM form_submissions WHERE id=?")
    .get(String(req.params.id)) as
    | { id: number; data: string; created_at: string }
    | undefined;
  return row
    ? res.json({
        id: row.id,
        data: JSON.parse(row.data),
        createdAt: row.created_at,
      })
    : res.status(404).json({ error: "Form submission not found" });
});
