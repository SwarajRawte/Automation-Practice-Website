import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { db, reset } from "./db.js";
const app = express();
app.use(express.json());
app.post("/api/forms", (req, res) => {
  const errors: Record<string, string> = {};
  if (!req.body.name || String(req.body.name).length < 2)
    errors.name = "Name must contain at least 2 characters";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(req.body.email || "")))
    errors.email = "A valid email is required";
  if (req.body.password !== req.body.confirmPassword)
    errors.confirmPassword = "Passwords must match";
  if (Object.keys(errors).length)
    return res.status(422).json({ error: "Form validation failed", errors });
  const id = Number(
    db
      .prepare("INSERT INTO form_submissions(data,created_at) VALUES(?,?)")
      .run(JSON.stringify(req.body), new Date().toISOString()).lastInsertRowid,
  );
  return res
    .status(201)
    .json({ id, data: req.body, message: "Form submitted successfully" });
});
app.get("/api/forms/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM form_submissions WHERE id=?")
    .get(String(req.params.id)) as any;
  return row
    ? res.json({ id: row.id, data: JSON.parse(row.data) })
    : res.status(404).json({ error: "Form submission not found" });
});
beforeEach(() => reset());
test("valid form data persists and can be retrieved", async () => {
  const payload = {
    name: "Phase Two Tester",
    email: "phase2@test.local",
    password: "Strong123!",
    confirmPassword: "Strong123!",
    quantity: 3,
  };
  const created = await request(app)
    .post("/api/forms")
    .send(payload)
    .expect(201);
  const loaded = await request(app)
    .get(`/api/forms/${created.body.id}`)
    .expect(200);
  assert.deepEqual(loaded.body.data, payload);
});
test("server returns deterministic field validation errors", async () => {
  const response = await request(app)
    .post("/api/forms")
    .send({ name: "A", email: "bad", password: "one", confirmPassword: "two" })
    .expect(422);
  assert.equal(response.body.error, "Form validation failed");
  assert.deepEqual(Object.keys(response.body.errors).sort(), [
    "confirmPassword",
    "email",
    "name",
  ]);
});
test("unknown submission returns 404", async () => {
  await request(app).get("/api/forms/9999").expect(404);
});
