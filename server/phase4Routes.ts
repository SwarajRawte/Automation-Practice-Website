import { Router } from "express";
import type { Server } from "socket.io";
import { db } from "./db.js";
import type { AuthRequest } from "./types.js";
import { roles, userRoom } from "./auth.js";
import { nowIso, nowMs } from "./clock.js";
import { createNetworkState, currentTestRun } from "./runContext.js";

export type NetworkConfig = {
  delay: number;
  failureRate: number;
  offline: boolean;
  statusCode: number | null;
  rateLimit: number;
};

interface Order {
  id: number;
  user_id: number;
  status: string;
  total: number;
  created_at: string;
}

interface OrderWithUser extends Order {
  email: string;
}

interface CountResult {
  count: number;
}

interface SumResult {
  total: number;
}

const defaultNetworkState = createNetworkState();
const networkState = () => currentTestRun()?.network || defaultNetworkState;
export const networkConfig = new Proxy(defaultNetworkState.config, {
  get(_target, property) {
    return Reflect.get(networkState().config, property);
  },
  set(_target, property, value) {
    return Reflect.set(networkState().config, property, value);
  },
  ownKeys() {
    return Reflect.ownKeys(networkState().config);
  },
  getOwnPropertyDescriptor(_target, property) {
    return Reflect.getOwnPropertyDescriptor(networkState().config, property);
  },
}) as NetworkConfig;

const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, Math.max(0, ms))),
  isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export function updateNetworkConfig(input: unknown): string | null {
  if (!isRecord(input)) return "Network configuration must be an object";
  const next = { ...networkConfig };
  if ("delay" in input) {
    const delay = Number(input.delay);
    if (!Number.isInteger(delay) || delay < 0 || delay > 5_000)
      return "Delay must be an integer between 0 and 5000";
    next.delay = delay;
  }
  if ("failureRate" in input) {
    const failureRate = Number(input.failureRate);
    if (!Number.isFinite(failureRate) || failureRate < 0 || failureRate > 1)
      return "Failure rate must be between 0 and 1";
    next.failureRate = failureRate;
  }
  if ("offline" in input) {
    if (typeof input.offline !== "boolean") return "Offline must be a boolean";
    next.offline = input.offline;
  }
  if ("statusCode" in input) {
    if (input.statusCode === null || input.statusCode === "") {
      next.statusCode = null;
    } else {
      const statusCode = Number(input.statusCode);
      if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 599)
        return "Status code must be null or an integer between 200 and 599";
      next.statusCode = statusCode;
    }
  }
  if ("rateLimit" in input) {
    const rateLimit = Number(input.rateLimit);
    if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 10_000)
      return "Rate limit must be an integer between 1 and 10000";
    next.rateLimit = rateLimit;
  }
  Object.assign(networkConfig, next);
  const state = networkState();
  state.failureAccumulator = 0;
  state.rateWindowStarted = nowMs();
  state.rateWindowRequests = 0;
  return null;
}

export function resetNetworkConfig() {
  const state = networkState(),
    fresh = createNetworkState();
  Object.assign(state.config, fresh.config);
  state.failureAccumulator = 0;
  state.rateWindowStarted = nowMs();
  state.rateWindowRequests = 0;
}

type CheckoutItem = {
  id: number;
  name: string;
  price: number;
  inventory: number;
  quantity: number;
};

class CheckoutError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

const rollback = () => {
  try {
    db.exec("ROLLBACK");
  } catch {
    // The transaction can already be closed when COMMIT itself fails.
  }
};

export function createPhase4Router(io?: Server) {
  const router = Router();

  router.get("/shop/products", (req, res) => {
    const min = req.query.min === undefined ? 0 : Number(req.query.min),
      max = req.query.max === undefined ? 1e9 : Number(req.query.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min)
      return res.status(422).json({ error: "Invalid price range" });
    const q = `%${String(req.query.q || "")}%`,
      category = String(req.query.category || ""),
      sort = ["price_asc", "price_desc", "rating"].includes(
        String(req.query.sort),
      )
        ? String(req.query.sort)
        : "name",
      order =
        sort === "price_asc"
          ? "price ASC"
          : sort === "price_desc"
            ? "price DESC"
            : sort === "rating"
              ? "((id % 5) + 1) DESC"
              : "name ASC";
    const data = db
      .prepare(
        `SELECT *, ((id % 5) + 1) rating FROM products WHERE deleted_at IS NULL AND (name LIKE ? OR category LIKE ?) AND (?='' OR category=?) AND price BETWEEN ? AND ? ORDER BY ${order}`,
      )
      .all(q, q, category, category, min, max);
    return res.json({ data, total: data.length });
  });

  router.get("/shop/products/:id", (req, res) => {
    const product = db
      .prepare(
        "SELECT *, ((id % 5) + 1) rating FROM products WHERE id=? AND deleted_at IS NULL",
      )
      .get(String(req.params.id));
    return product
      ? res.json(product)
      : res.status(404).json({ error: "Product not found" });
  });

  router.get("/shop/wishlist", (req: AuthRequest, res) =>
    res.json({
      data: db
        .prepare(
          "SELECT p.* FROM wishlists w JOIN products p ON p.id=w.product_id WHERE w.user_id=? AND p.deleted_at IS NULL ORDER BY w.created_at",
        )
        .all(req.user!.id),
    }),
  );

  router.post(
    "/shop/wishlist/:productId",
    roles("ADMIN", "USER"),
    (req: AuthRequest, res) => {
      const productId = Number(req.params.productId);
      if (!Number.isInteger(productId) || productId <= 0)
        return res.status(422).json({ error: "Invalid product id" });
      const product = db
        .prepare("SELECT id FROM products WHERE id=? AND deleted_at IS NULL")
        .get(productId);
      if (!product) return res.status(404).json({ error: "Product not found" });
      const result = db
        .prepare(
          "INSERT OR IGNORE INTO wishlists(user_id,product_id,created_at) VALUES(?,?,?)",
        )
        .run(req.user!.id, productId, nowIso());
      return res.status(result.changes ? 201 : 200).json({
        added: Boolean(result.changes),
        productId,
      });
    },
  );

  router.delete(
    "/shop/wishlist/:productId",
    roles("ADMIN", "USER"),
    (req: AuthRequest, res) => {
      db.prepare("DELETE FROM wishlists WHERE user_id=? AND product_id=?").run(
        req.user!.id,
        String(req.params.productId),
      );
      res.status(204).end();
    },
  );

  router.post(
    "/shop/checkout",
    roles("ADMIN", "USER"),
    (req: AuthRequest, res) => {
      const body = isRecord(req.body) ? req.body : {},
        rawItems = body.items,
        shippingAddress = isRecord(body.shippingAddress)
          ? body.shippingAddress
          : {},
        line1 =
          typeof shippingAddress.line1 === "string"
            ? shippingAddress.line1.trim()
            : "",
        city =
          typeof shippingAddress.city === "string"
            ? shippingAddress.city.trim()
            : "";
      if (!Array.isArray(rawItems) || !rawItems.length || !line1 || !city)
        return res
          .status(422)
          .json({ error: "Cart and shipping address are required" });
      if (rawItems.length > 100)
        return res.status(422).json({ error: "Cart contains too many items" });

      const quantities = new Map<number, number>();
      for (const rawItem of rawItems) {
        if (!isRecord(rawItem))
          return res.status(422).json({ error: "Invalid cart item" });
        const productId = Number(rawItem.productId),
          quantity = Number(rawItem.quantity);
        if (
          !Number.isInteger(productId) ||
          productId <= 0 ||
          !Number.isSafeInteger(quantity) ||
          quantity <= 0
        )
          return res.status(422).json({
            error: "Product ids and quantities must be positive integers",
            code: "INVALID_CART",
          });
        const combined = (quantities.get(productId) || 0) + quantity;
        if (!Number.isSafeInteger(combined))
          return res.status(422).json({
            error: "Cart quantity is too large",
            code: "INVALID_CART",
          });
        quantities.set(productId, combined);
      }

      const shippingMethod = body.shippingMethod || "standard";
      if (shippingMethod !== "standard" && shippingMethod !== "express")
        return res.status(422).json({ error: "Invalid shipping method" });
      const discountCode = body.discountCode;
      if (discountCode && discountCode !== "SAVE10")
        return res.status(422).json({
          error: "Invalid discount code",
          code: "INVALID_DISCOUNT",
        });
      const cardNumber = body.cardNumber;
      if (cardNumber === "4000000000000002")
        return res
          .status(402)
          .json({ error: "Payment declined", code: "PAYMENT_DECLINED" });
      if (cardNumber === "4000000000009995")
        return res
          .status(408)
          .json({ error: "Payment timed out", code: "PAYMENT_TIMEOUT" });
      if (cardNumber !== "4111111111111111")
        return res
          .status(422)
          .json({ error: "Use a documented mock card number" });

      let checkout: {
        orderId: number;
        subtotal: number;
        discount: number;
        shipping: number;
        tax: number;
        total: number;
      };
      db.exec("BEGIN IMMEDIATE");
      try {
        const rows: CheckoutItem[] = [...quantities].map(
          ([productId, quantity]) => {
            const product = db
              .prepare(
                "SELECT id,name,price,inventory,status FROM products WHERE id=? AND deleted_at IS NULL",
              )
              .get(productId) as
              | {
                  id: number;
                  name: string;
                  price: number;
                  inventory: number;
                  status: string;
                }
              | undefined;
            if (!product || product.status === "INACTIVE")
              throw new CheckoutError(
                409,
                `Product ${productId} is unavailable`,
                "PRODUCT_UNAVAILABLE",
              );
            if (product.inventory < quantity)
              throw new CheckoutError(
                409,
                `Insufficient stock for product ${productId}`,
                "INSUFFICIENT_STOCK",
              );
            return { ...product, quantity };
          },
        );
        const subtotal = Number(
            rows
              .reduce((sum, item) => sum + item.price * item.quantity, 0)
              .toFixed(2),
          ),
          discount =
            discountCode === "SAVE10" ? Number((subtotal * 0.1).toFixed(2)) : 0,
          shipping = shippingMethod === "express" ? 15 : 5,
          tax = Number(((subtotal - discount) * 0.13).toFixed(2)),
          total = Number((subtotal - discount + shipping + tax).toFixed(2)),
          orderId = Number(
            db
              .prepare(
                "INSERT INTO orders(user_id,status,total,created_at) VALUES(?,?,?,?)",
              )
              .run(req.user!.id, "CONFIRMED", total, nowIso()).lastInsertRowid,
          );
        for (const item of rows) {
          db.prepare(
            "INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES(?,?,?,?,?)",
          ).run(orderId, item.id, item.name, item.price, item.quantity);
          const updated = db
            .prepare(
              "UPDATE products SET inventory=inventory-?,status=CASE WHEN inventory-?=0 THEN 'OUT_OF_STOCK' ELSE status END,version=version+1,updated_at=? WHERE id=? AND deleted_at IS NULL AND inventory>=?",
            )
            .run(
              item.quantity,
              item.quantity,
              nowIso(),
              item.id,
              item.quantity,
            );
          if (!updated.changes)
            throw new CheckoutError(
              409,
              `Insufficient stock for product ${item.id}`,
              "INSUFFICIENT_STOCK",
            );
        }
        checkout = { orderId, subtotal, discount, shipping, tax, total };
        db.exec("COMMIT");
      } catch (error) {
        rollback();
        if (error instanceof CheckoutError)
          return res
            .status(error.status)
            .json({ error: error.message, code: error.code });
        throw error;
      }
      io?.to(userRoom(req.user!.id)).emit("order-status", {
        orderId: checkout.orderId,
        status: "CONFIRMED",
      });
      return res.status(201).json({
        orderId: checkout.orderId,
        status: "CONFIRMED",
        subtotal: checkout.subtotal,
        discount: checkout.discount,
        shipping: checkout.shipping,
        tax: checkout.tax,
        total: checkout.total,
        message: "Payment successful",
      });
    },
  );

  router.get("/shop/orders", (req: AuthRequest, res) =>
    res.json({
      data: db
        .prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC")
        .all(req.user!.id),
    }),
  );

  router.get("/shop/orders/:id", (req: AuthRequest, res) => {
    const order = db
      .prepare("SELECT * FROM orders WHERE id=? AND user_id=?")
      .get(String(req.params.id), req.user!.id) as Order | undefined;
    return order
      ? res.json({
          ...order,
          items: db
            .prepare("SELECT * FROM order_items WHERE order_id=?")
            .all(order.id),
        })
      : res.status(404).json({ error: "Order not found" });
  });

  router.post(
    "/shop/orders/:id/cancel",
    roles("ADMIN", "USER"),
    (req: AuthRequest, res) => {
      const orderId = Number(req.params.id);
      if (!Number.isInteger(orderId) || orderId <= 0)
        return res.status(404).json({ error: "Order not found" });
      db.exec("BEGIN IMMEDIATE");
      try {
        const order = db
          .prepare("SELECT * FROM orders WHERE id=? AND user_id=?")
          .get(orderId, req.user!.id) as
          { id: number; status: string } | undefined;
        if (!order)
          throw new CheckoutError(404, "Order not found", "NOT_FOUND");
        if (order.status === "CANCELLED")
          throw new CheckoutError(
            409,
            "Order is already cancelled",
            "ORDER_ALREADY_CANCELLED",
          );
        if (order.status === "DELIVERED")
          throw new CheckoutError(
            409,
            "Delivered orders cannot be cancelled",
            "ORDER_NOT_CANCELLABLE",
          );
        const result = db
          .prepare(
            "UPDATE orders SET status='CANCELLED' WHERE id=? AND user_id=? AND status NOT IN ('CANCELLED','DELIVERED')",
          )
          .run(orderId, req.user!.id);
        if (!result.changes)
          throw new CheckoutError(
            409,
            "Order cannot be cancelled",
            "ORDER_NOT_CANCELLABLE",
          );
        // Orders created by checkout start as CONFIRMED and have reduced stock.
        // Seeded historical PROCESSING orders do not reserve current inventory.
        if (order.status === "CONFIRMED") {
          const items = db
            .prepare(
              "SELECT product_id,quantity FROM order_items WHERE order_id=?",
            )
            .all(orderId) as Array<{ product_id: number; quantity: number }>;
          for (const item of items)
            db.prepare(
              "UPDATE products SET inventory=inventory+?,status=CASE WHEN status='OUT_OF_STOCK' THEN 'ACTIVE' ELSE status END,version=version+1,updated_at=? WHERE id=?",
            ).run(item.quantity, nowIso(), item.product_id);
        }
        db.exec("COMMIT");
      } catch (error) {
        rollback();
        if (error instanceof CheckoutError)
          return res
            .status(error.status)
            .json({ error: error.message, code: error.code });
        throw error;
      }
      io?.to(userRoom(req.user!.id)).emit("order-status", {
        orderId,
        status: "CANCELLED",
      });
      return res.json({ id: orderId, status: "CANCELLED" });
    },
  );

  router.get("/network/config", (_req, res) => res.json(networkConfig));
  router.put("/network/config", roles("ADMIN"), (req, res) => {
    const error = updateNetworkConfig(req.body);
    return error ? res.status(422).json({ error }) : res.json(networkConfig);
  });
  router.all("/network/echo", async (req, res) => {
    const now = nowMs(),
      state = networkState();
    if (
      now < state.rateWindowStarted ||
      now - state.rateWindowStarted >= 1_000
    ) {
      state.rateWindowStarted = now;
      state.rateWindowRequests = 0;
    }
    state.rateWindowRequests += 1;
    if (state.rateWindowRequests > networkConfig.rateLimit)
      return res.status(429).json({
        error: "Simulated rate limit exceeded",
        code: "RATE_LIMITED",
      });
    await wait(networkConfig.delay);
    if (networkConfig.offline)
      return res.status(503).json({ error: "Simulated offline mode" });
    if (networkConfig.statusCode)
      return res.status(networkConfig.statusCode).json({
        simulated: true,
        status: networkConfig.statusCode,
      });
    state.failureAccumulator += networkConfig.failureRate;
    if (state.failureAccumulator >= 1) {
      state.failureAccumulator -= 1;
      return res.status(503).json({
        error: "Simulated network failure",
        code: "SIMULATED_FAILURE",
      });
    }
    return res.set("x-test-lab", "phase-4").json({
      method: req.method,
      query: req.query,
      body: req.body,
      requestId: res.get("x-request-id"),
    });
  });

  router.get("/admin/summary", roles("ADMIN"), (_req, res) =>
    res.json({
      users: (db.prepare("SELECT COUNT(*) count FROM users").get() as CountResult)
        .count,
      orders: (db.prepare("SELECT COUNT(*) count FROM orders").get() as CountResult)
        .count,
      revenue: (
        db
          .prepare(
            "SELECT COALESCE(SUM(total),0) total FROM orders WHERE status!='CANCELLED'",
          )
          .get() as SumResult
      ).total,
      products: (
        db
          .prepare(
            "SELECT COUNT(*) count FROM products WHERE deleted_at IS NULL",
          )
          .get() as CountResult
      ).count,
    }),
  );
  router.get("/admin/orders", roles("ADMIN"), (_req, res) =>
    res.json({
      data: db
        .prepare(
          "SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC",
        )
        .all(),
    }),
  );
  router.get("/admin/export", roles("ADMIN"), (_req, res) => {
    const rows = db
      .prepare(
        "SELECT id,user_id,status,total,created_at FROM orders ORDER BY id",
      )
      .all() as Order[];
    res
      .attachment("orders-report.csv")
      .type("text/csv")
      .send(
        `id,user_id,status,total,created_at\n${rows
          .map(
            (row) =>
              `${row.id},${row.user_id},${row.status},${row.total},${row.created_at}`,
          )
          .join("\n")}`,
      );
  });
  return router;
}
