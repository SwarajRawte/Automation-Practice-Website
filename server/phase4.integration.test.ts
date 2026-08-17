import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createPhase4Router, networkConfig } from "./phase4Routes.js";
import { db, reset } from "./db.js";

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: req.get("x-user") === "admin" ? 1 : 2, email: "test@testlab.local", name: "Test User", role: req.get("x-role") || "USER" };
  next();
});
app.use("/api", createPhase4Router());

beforeEach(() => {
  reset();
  Object.assign(networkConfig, { delay: 0, failureRate: 0, offline: false, statusCode: null, rateLimit: 10 });
});

test("shop catalog supports deterministic filtering, sorting, and product details", async () => {
  const catalog = await request(app).get("/api/shop/products?category=Hardware&sort=price_desc").expect(200);
  assert.equal(catalog.body.total, 10);
  assert.equal(catalog.body.data[0].category, "Hardware");
  assert.ok(catalog.body.data[0].price > catalog.body.data[1].price);
  const product = await request(app).get("/api/shop/products/7").expect(200);
  assert.equal(product.body.status, "OUT_OF_STOCK");
});

test("wishlist and successful checkout persist a user order and reduce stock", async () => {
  await request(app).post("/api/shop/wishlist/1").expect(201);
  await request(app).post("/api/shop/wishlist/99999").expect(404);
  const wishlist = await request(app).get("/api/shop/wishlist").expect(200);
  assert.equal(wishlist.body.data[0].id, 1);
  const checkout = await request(app).post("/api/shop/checkout").send({
    items: [{ productId: 1, quantity: 2 }],
    cardNumber: "4111111111111111",
    shippingAddress: { line1: "100 Automation Way", city: "Toronto" },
    shippingMethod: "standard",
    discountCode: "SAVE10",
  }).expect(201);
  assert.equal(checkout.body.status, "CONFIRMED");
  assert.ok(checkout.body.discount > 0);
  const orders = await request(app).get("/api/shop/orders").expect(200);
  assert.equal(orders.body.data[0].id, checkout.body.orderId);
  const detail = await request(app).get(`/api/shop/orders/${checkout.body.orderId}`).expect(200);
  assert.equal(detail.body.items[0].quantity, 2);
  const depleted = db
    .prepare("SELECT inventory,status FROM products WHERE id=1")
    .get() as { inventory: number; status: string };
  assert.equal(depleted.inventory, 0);
  assert.equal(depleted.status, "OUT_OF_STOCK");
  await request(app)
    .post(`/api/shop/orders/${checkout.body.orderId}/cancel`)
    .expect(200);
  const restored = db
    .prepare("SELECT inventory,status FROM products WHERE id=1")
    .get() as { inventory: number; status: string };
  assert.equal(restored.inventory, 2);
  assert.equal(restored.status, "ACTIVE");
  await request(app)
    .post(`/api/shop/orders/${checkout.body.orderId}/cancel`)
    .expect(409);
  assert.equal(
    (
      db.prepare("SELECT inventory FROM products WHERE id=1").get() as {
        inventory: number;
      }
    ).inventory,
    2,
  );
});

test("checkout rejects corrupt quantities, aggregate oversells, and unavailable products atomically", async () => {
  const base = {
    cardNumber: "4111111111111111",
    shippingAddress: { line1: "1 Test St", city: "Toronto" },
  };
  for (const quantity of [0, -1, 1.5, "not-a-number"])
    await request(app)
      .post("/api/shop/checkout")
      .send({ ...base, items: [{ productId: 1, quantity }] })
      .expect(422);
  const oversell = await request(app)
    .post("/api/shop/checkout")
    .send({
      ...base,
      items: [
        { productId: 1, quantity: 2 },
        { productId: 1, quantity: 1 },
      ],
    })
    .expect(409);
  assert.equal(oversell.body.code, "INSUFFICIENT_STOCK");
  assert.equal(
    (
      db.prepare("SELECT inventory FROM products WHERE id=1").get() as {
        inventory: number;
      }
    ).inventory,
    2,
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) count FROM orders").get() as { count: number })
      .count,
    12,
  );
  db.prepare("UPDATE products SET deleted_at=? WHERE id=2").run(
    new Date().toISOString(),
  );
  const unavailable = await request(app)
    .post("/api/shop/checkout")
    .send({ ...base, items: [{ productId: 2, quantity: 1 }] })
    .expect(409);
  assert.equal(unavailable.body.code, "PRODUCT_UNAVAILABLE");
  await request(app).post("/api/shop/wishlist/2").expect(404);
});

test("mock payment decline, timeout, and invalid discount are deterministic", async () => {
  const base = { items: [{ productId: 1, quantity: 1 }], shippingAddress: { line1: "1 Test St", city: "Toronto" } };
  await request(app).post("/api/shop/checkout").send({ ...base, cardNumber: "4000000000000002" }).expect(402);
  await request(app).post("/api/shop/checkout").send({ ...base, cardNumber: "4000000000009995" }).expect(408);
  const discount = await request(app).post("/api/shop/checkout").send({ ...base, cardNumber: "4111111111111111", discountCode: "WRONG" }).expect(422);
  assert.equal(discount.body.code, "INVALID_DISCOUNT");
});

test("network simulation and admin authorization are observable", async () => {
  const echo = await request(app).post("/api/network/echo?case=phase4").send({ hello: "world" }).expect(200);
  assert.equal(echo.body.method, "POST");
  assert.equal(echo.headers["x-test-lab"], "phase-4");
  await request(app).get("/api/admin/summary").expect(403);
  const summary = await request(app).get("/api/admin/summary").set("x-role", "ADMIN").set("x-user", "admin").expect(200);
  assert.equal(summary.body.products, 30);
  assert.equal(summary.body.orders, 12);
  await request(app).get("/api/admin/export").set("x-role", "ADMIN").set("x-user", "admin").expect("content-disposition", /orders-report.csv/).expect(200);
  await request(app)
    .put("/api/network/config")
    .set("x-role", "ADMIN")
    .send({ delay: -1 })
    .expect(422);
  await request(app)
    .put("/api/network/config")
    .set("x-role", "ADMIN")
    .send({ statusCode: 700 })
    .expect(422);
  await request(app)
    .put("/api/network/config")
    .set("x-role", "ADMIN")
    .send({ statusCode: 199 })
    .expect(422);
  assert.equal(networkConfig.delay, 0);
  assert.equal(networkConfig.statusCode, null);
  await request(app)
    .put("/api/network/config")
    .set("x-role", "ADMIN")
    .send({ failureRate: 1, rateLimit: 100 })
    .expect(200);
  const failed = await request(app).get("/api/network/echo").expect(503);
  assert.equal(failed.body.code, "SIMULATED_FAILURE");
  await request(app)
    .put("/api/network/config")
    .set("x-role", "ADMIN")
    .send({ failureRate: 0, rateLimit: 1 })
    .expect(200);
  await request(app).get("/api/network/echo").expect(200);
  const limited = await request(app).get("/api/network/echo").expect(429);
  assert.equal(limited.body.code, "RATE_LIMITED");
});
