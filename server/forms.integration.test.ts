import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { db, reset } from "./db.js";
import { formsRouter } from "./formsRoutes.js";
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = {
    id: Number(req.get("x-user-id") || 2),
    email: "form-user@testlab.local",
    name: "Form User",
    role: req.get("x-role") || "USER",
  };
  next();
});
app.use("/api", formsRouter);
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
  const safePayload = {
    name: payload.name,
    email: payload.email,
    quantity: payload.quantity,
  };
  assert.deepEqual(created.body.data, safePayload);
  assert.deepEqual(loaded.body.data, safePayload);
  const stored = db
    .prepare("SELECT user_id,data FROM form_submissions WHERE id=?")
    .get(created.body.id) as { user_id: number; data: string };
  assert.equal(stored.user_id, 2);
  assert.equal(/password/i.test(stored.data), false);
});

test("form submissions are visible only to their owner", async () => {
  const created = await request(app)
    .post("/api/forms")
    .set("x-user-id", "2")
    .send({
      name: "Owner Test",
      email: "owner@test.local",
      password: "Strong123!",
      confirmPassword: "Strong123!",
    })
    .expect(201);
  await request(app)
    .get(`/api/forms/${created.body.id}`)
    .set("x-user-id", "3")
    .expect(404);
  await request(app)
    .get(`/api/forms/${created.body.id}`)
    .set("x-user-id", "2")
    .expect(200);
});

test("viewer cannot submit persistent form data", async () => {
  await request(app)
    .post("/api/forms")
    .set("x-role", "VIEWER")
    .send({
      name: "Read Only",
      email: "viewer@test.local",
      password: "Strong123!",
      confirmPassword: "Strong123!",
    })
    .expect(403);
  assert.equal(
    (
      db.prepare("SELECT COUNT(*) count FROM form_submissions").get() as {
        count: number;
      }
    ).count,
    0,
  );
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
    "password",
  ]);
});
test("server rejects missing passwords and malformed numeric/date fields", async () => {
  const missingPassword = await request(app)
    .post("/api/forms")
    .send({ name: "Valid Name", email: "valid@test.local" })
    .expect(422);
  assert.equal(
    missingPassword.body.errors.password,
    "Password must contain at least 8 characters",
  );
  const malformed = await request(app)
    .post("/api/forms")
    .send({
      name: "Valid Name",
      email: "valid@test.local",
      password: "Strong123!",
      confirmPassword: "Strong123!",
      quantity: 0,
      startDate: "2026-02-02",
      endDate: "2026-02-01",
    })
    .expect(422);
  assert.ok(malformed.body.errors.quantity);
  assert.ok(malformed.body.errors.endDate);
});
test("unknown submission returns 404", async () => {
  await request(app).get("/api/forms/9999").expect(404);
});
