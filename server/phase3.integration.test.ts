import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { phase3Router } from "./phase3Routes.js";
import { reset } from "./db.js";
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = {
    id: Number(req.get("x-user-id") || 1),
    email: "file-owner@testlab.local",
    name: "Test Administrator",
    role: req.get("x-role") || "ADMIN",
  };
  next();
});
app.use("/api", phase3Router);
beforeEach(() => {
  delete process.env.UPLOAD_QUOTA_BYTES;
  reset();
});
test("table API is deterministic with server sorting filtering and pagination", async () => {
  const first = await request(app)
    .get("/api/table-users?page=1&size=5&sort=name&direction=desc")
    .expect(200);
  assert.equal(first.body.total, 100);
  assert.equal(first.body.data.length, 5);
  assert.equal(first.body.data[0].name, "QA User 100");
  const filtered = await request(app)
    .get("/api/table-users?search=qa.user042&size=20")
    .expect(200);
  assert.equal(filtered.body.total, 1);
  assert.equal(filtered.body.data[0].id, 42);
  const inactive = await request(app)
    .get("/api/table-users?status=INACTIVE&size=100")
    .expect(200);
  assert.equal(inactive.body.total, 11);
  const multi = await request(app)
    .get("/api/table-users?size=100&sorts=department:asc,score:desc")
    .expect(200);
  assert.equal(multi.body.data[0].department, "Engineering");
  assert.ok(multi.body.data[0].score >= multi.body.data[1].score);
  const invalidPage = await request(app)
    .get("/api/table-users?page=-4&size=-20")
    .expect(200);
  assert.equal(invalidPage.body.page, 1);
  assert.equal(invalidPage.body.size, 10);
  assert.equal(invalidPage.body.data.length, 10);
});
test("product CRUD supports validation conflict duplicate history delete and undo", async () => {
  const invalidPage = await request(app)
    .get("/api/products?page=-1&size=-50")
    .expect(200);
  assert.equal(invalidPage.body.page, 1);
  assert.equal(invalidPage.body.size, 10);
  assert.equal(invalidPage.body.data.length, 10);
  await request(app)
    .post("/api/products")
    .send({ name: "Missing Price", category: "Hardware", inventory: 1 })
    .expect(422);
  await request(app)
    .post("/api/products")
    .send({
      name: "Fractional Stock",
      category: "Hardware",
      price: 2,
      inventory: 1.5,
    })
    .expect(422);
  const created = await request(app)
    .post("/api/products")
    .send({
      name: "Phase 3 Product",
      category: "Hardware",
      price: 25,
      inventory: 4,
      status: "ACTIVE",
    })
    .expect(201);
  await request(app)
    .post(`/api/products/${created.body.id}/undo`)
    .send({ undoToken: `UNDO-PRODUCT-${created.body.id}` })
    .expect(409);
  await request(app)
    .post("/api/products")
    .send({
      name: "Phase 3 Product",
      category: "Hardware",
      price: 25,
      inventory: 4,
    })
    .expect(409);
  await request(app)
    .put(`/api/products/${created.body.id}`)
    .send({ ...created.body, price: 30, version: 999 })
    .expect(409);
  const updated = await request(app)
    .put(`/api/products/${created.body.id}`)
    .send({ ...created.body, price: 30, version: created.body.version })
    .expect(200);
  assert.equal(updated.body.price, 30);
  const image = await request(app)
    .post(`/api/products/${created.body.id}/image`)
    .attach("image", Buffer.from("deterministic png bytes"), "product.png")
    .expect(200);
  assert.ok(image.body.image_file_id);
  await request(app)
    .delete(`/api/files/${image.body.image_file_id}`)
    .expect(409)
    .expect((response) => assert.equal(response.body.code, "FILE_IN_USE"));
  const copy = await request(app)
    .post(`/api/products/${created.body.id}/duplicate`)
    .send({})
    .expect(201);
  assert.match(copy.body.name, /Copy/);
  const removed = await request(app)
    .delete(`/api/products/${created.body.id}`)
    .expect(200);
  await request(app).get(`/api/products/${created.body.id}`).expect(404);
  await request(app)
    .post(`/api/products/${created.body.id}/undo`)
    .send({ undoToken: removed.body.undoToken })
    .expect(200);
  const history = await request(app)
    .get(`/api/products/${created.body.id}/history`)
    .expect(200);
  assert.ok(history.body.data.length >= 4);
});
test("viewer cannot mutate products", async () => {
  await request(app)
    .post("/api/products")
    .set("x-role", "VIEWER")
    .send({ name: "Forbidden", category: "Hardware", price: 1, inventory: 1 })
    .expect(403);
});
test("files persist, reject duplicates, remove, process CSV, and download", async () => {
  await request(app).post("/api/files/upload").expect(422);
  await request(app)
    .post("/api/files/upload")
    .attach("files", Buffer.from("valid first file"), "first.txt")
    .attach("files", Buffer.from("invalid second file"), "second.exe")
    .expect(415);
  const emptyList = await request(app).get("/api/files").expect(200);
  assert.equal(emptyList.body.data.length, 0);
  const upload = await request(app)
    .post("/api/files/upload")
    .attach("files", Buffer.from("deterministic file"), "sample.txt")
    .expect(201);
  assert.equal(upload.body.files[0].name, "sample.txt");
  await request(app)
    .post("/api/files/upload")
    .attach("files", Buffer.from("deterministic file"), "duplicate.txt")
    .expect(409);
  const list = await request(app).get("/api/files").expect(200);
  assert.equal(list.body.data.length, 1);
  const otherUsersList = await request(app)
    .get("/api/files")
    .set("x-user-id", "2")
    .expect(200);
  assert.equal(otherUsersList.body.data.length, 0);
  const otherUsersCopy = await request(app)
    .post("/api/files/upload")
    .set("x-user-id", "2")
    .attach("files", Buffer.from("deterministic file"), "same-content.txt")
    .expect(201);
  assert.notEqual(otherUsersCopy.body.files[0].id, upload.body.files[0].id);
  const populatedOtherList = await request(app)
    .get("/api/files")
    .set("x-user-id", "2")
    .expect(200);
  assert.equal(populatedOtherList.body.data.length, 1);
  await request(app)
    .delete(`/api/files/${upload.body.files[0].id}`)
    .set("x-user-id", "2")
    .expect(404);
  const csv = await request(app)
    .post("/api/files/process-csv")
    .attach("file", Buffer.from("id,name\n1,Alpha\n2,Bravo"), "users.csv")
    .expect(200);
  assert.equal(csv.body.rows, 2);
  await request(app)
    .get("/api/files/download/csv")
    .expect("content-type", /text\/csv/)
    .expect(200);
  await request(app).get("/api/files/download/failed").expect(500);
  await request(app)
    .delete(`/api/files/${upload.body.files[0].id}`)
    .expect(204);
});

test("viewer cannot upload or delete files", async () => {
  await request(app)
    .post("/api/files/upload")
    .set("x-role", "VIEWER")
    .attach("files", Buffer.from("blocked viewer upload"), "blocked.txt")
    .expect(403);
  const uploaded = await request(app)
    .post("/api/files/upload")
    .attach("files", Buffer.from("owned admin file"), "owned.txt")
    .expect(201);
  await request(app)
    .delete(`/api/files/${uploaded.body.files[0].id}`)
    .set("x-role", "VIEWER")
    .expect(403);
});

test("stored upload quota is enforced per user", async () => {
  process.env.UPLOAD_QUOTA_BYTES = "20";
  try {
    await request(app)
      .post("/api/files/upload")
      .attach("files", Buffer.alloc(15, "a"), "first.txt")
      .expect(201);
    await request(app)
      .post("/api/files/upload")
      .attach("files", Buffer.alloc(10, "b"), "second.txt")
      .expect(413)
      .expect((response) =>
        assert.equal(response.body.code, "UPLOAD_QUOTA_EXCEEDED"),
      );
    await request(app)
      .post("/api/files/upload")
      .set("x-user-id", "2")
      .attach("files", Buffer.alloc(10, "b"), "second.txt")
      .expect(201);
  } finally {
    delete process.env.UPLOAD_QUOTA_BYTES;
  }
});
