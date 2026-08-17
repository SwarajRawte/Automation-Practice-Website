import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { reset } from "./db.js";
import { formsRouter } from "./formsRoutes.js";
const app = express();
app.use(express.json());
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
