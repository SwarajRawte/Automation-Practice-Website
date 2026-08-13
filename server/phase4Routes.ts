import { Router } from "express";
import type { Server } from "socket.io";
import { db } from "./db.js";
import type { AuthRequest } from "./types.js";
import { roles } from "./auth.js";

export type NetworkConfig = { delay: number; failureRate: number; offline: boolean; statusCode: number | null; rateLimit: number };
export const networkConfig: NetworkConfig = { delay: 0, failureRate: 0, offline: false, statusCode: null, rateLimit: 10 };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createPhase4Router(io?: Server) {
  const router = Router();
  router.get("/shop/products", (req, res) => {
    const q = `%${String(req.query.q || "")}%`, category = String(req.query.category || ""),
      min = Number(req.query.min || 0), max = Number(req.query.max || 1e9),
      sort = ["price_asc", "price_desc", "rating"].includes(String(req.query.sort)) ? String(req.query.sort) : "name",
      order = sort === "price_asc" ? "price ASC" : sort === "price_desc" ? "price DESC" : sort === "rating" ? "((id % 5) + 1) DESC" : "name ASC";
    const data = db.prepare(`SELECT *, ((id % 5) + 1) rating FROM products WHERE deleted_at IS NULL AND (name LIKE ? OR category LIKE ?) AND (?='' OR category=?) AND price BETWEEN ? AND ? ORDER BY ${order}`).all(q, q, category, category, min, max);
    res.json({ data, total: data.length });
  });
  router.get("/shop/products/:id", (req, res) => {
    const product = db.prepare("SELECT *, ((id % 5) + 1) rating FROM products WHERE id=? AND deleted_at IS NULL").get(String(req.params.id));
    return product ? res.json(product) : res.status(404).json({ error: "Product not found" });
  });
  router.get("/shop/wishlist", (req: AuthRequest, res) => res.json({ data: db.prepare("SELECT p.* FROM wishlists w JOIN products p ON p.id=w.product_id WHERE w.user_id=? ORDER BY w.created_at").all(req.user!.id) }));
  router.post("/shop/wishlist/:productId", (req: AuthRequest, res) => {
    db.prepare("INSERT OR IGNORE INTO wishlists(user_id,product_id,created_at) VALUES(?,?,?)").run(req.user!.id, String(req.params.productId), new Date().toISOString());
    res.status(201).json({ added: true, productId: Number(req.params.productId) });
  });
  router.delete("/shop/wishlist/:productId", (req: AuthRequest, res) => { db.prepare("DELETE FROM wishlists WHERE user_id=? AND product_id=?").run(req.user!.id, String(req.params.productId)); res.status(204).end(); });
  router.post("/shop/checkout", (req: AuthRequest, res) => {
    const { items = [], cardNumber, shippingAddress, shippingMethod = "standard", discountCode } = req.body;
    if (!items.length || !shippingAddress?.line1 || !shippingAddress?.city) return res.status(422).json({ error: "Cart and shipping address are required" });
    if (cardNumber === "4000000000000002") return res.status(402).json({ error: "Payment declined", code: "PAYMENT_DECLINED" });
    if (cardNumber === "4000000000009995") return res.status(408).json({ error: "Payment timed out", code: "PAYMENT_TIMEOUT" });
    if (cardNumber !== "4111111111111111") return res.status(422).json({ error: "Use a documented mock card number" });
    const rows = items.map((item: any) => {
      const product = db.prepare("SELECT * FROM products WHERE id=?").get(Number(item.productId)) as any;
      if (!product || product.inventory < Number(item.quantity)) throw new Error(`Insufficient stock for product ${item.productId}`);
      return { ...product, quantity: Number(item.quantity) };
    });
    const subtotal = rows.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0), discount = discountCode === "SAVE10" ? subtotal * .1 : 0;
    if (discountCode && discountCode !== "SAVE10") return res.status(422).json({ error: "Invalid discount code", code: "INVALID_DISCOUNT" });
    const shipping = shippingMethod === "express" ? 15 : 5, tax = (subtotal - discount) * .13, total = Number((subtotal - discount + shipping + tax).toFixed(2));
    db.exec("BEGIN");
    let orderId: number;
    try {
      orderId = Number(db.prepare("INSERT INTO orders(user_id,status,total,created_at) VALUES(?,?,?,?)").run(req.user!.id, "CONFIRMED", total, new Date().toISOString()).lastInsertRowid);
      for (const item of rows) { db.prepare("INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES(?,?,?,?,?)").run(orderId, item.id, item.name, item.price, item.quantity); db.prepare("UPDATE products SET inventory=inventory-? WHERE id=?").run(item.quantity, item.id); }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    io?.emit("order-status", { orderId, status: "CONFIRMED" });
    res.status(201).json({ orderId, status: "CONFIRMED", subtotal, discount, shipping, tax: Number(tax.toFixed(2)), total, message: "Payment successful" });
  });
  router.get("/shop/orders", (req: AuthRequest, res) => res.json({ data: db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC").all(req.user!.id) }));
  router.get("/shop/orders/:id", (req: AuthRequest, res) => {
    const order = db.prepare("SELECT * FROM orders WHERE id=? AND user_id=?").get(String(req.params.id), req.user!.id) as any;
    return order ? res.json({ ...order, items: db.prepare("SELECT * FROM order_items WHERE order_id=?").all(order.id) }) : res.status(404).json({ error: "Order not found" });
  });
  router.post("/shop/orders/:id/cancel", (req: AuthRequest, res) => {
    const result = db.prepare("UPDATE orders SET status='CANCELLED' WHERE id=? AND user_id=? AND status!='DELIVERED'").run(String(req.params.id), req.user!.id);
    if (!result.changes) return res.status(409).json({ error: "Order cannot be cancelled" });
    io?.emit("order-status", { orderId: Number(req.params.id), status: "CANCELLED" }); res.json({ id: Number(req.params.id), status: "CANCELLED" });
  });
  router.get("/network/config", (_req, res) => res.json(networkConfig));
  router.put("/network/config", roles("ADMIN"), (req, res) => { Object.assign(networkConfig, req.body); res.json(networkConfig); });
  router.all("/network/echo", async (req, res) => {
    await wait(Math.min(5000, Number(networkConfig.delay)));
    if (networkConfig.offline) return res.status(503).json({ error: "Simulated offline mode" });
    if (networkConfig.statusCode) return res.status(networkConfig.statusCode).json({ simulated: true, status: networkConfig.statusCode });
    res.set("x-test-lab", "phase-4").json({ method: req.method, query: req.query, body: req.body, requestId: res.get("x-request-id") });
  });
  router.get("/admin/summary", roles("ADMIN"), (_req, res) => res.json({ users: (db.prepare("SELECT COUNT(*) count FROM users").get() as any).count, orders: (db.prepare("SELECT COUNT(*) count FROM orders").get() as any).count, revenue: (db.prepare("SELECT COALESCE(SUM(total),0) total FROM orders WHERE status!='CANCELLED'").get() as any).total, products: (db.prepare("SELECT COUNT(*) count FROM products WHERE deleted_at IS NULL").get() as any).count }));
  router.get("/admin/orders", roles("ADMIN"), (_req, res) => res.json({ data: db.prepare("SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC").all() }));
  router.get("/admin/export", roles("ADMIN"), (_req, res) => { const rows = db.prepare("SELECT id,user_id,status,total,created_at FROM orders ORDER BY id").all() as any[]; res.attachment("orders-report.csv").send(`id,user_id,status,total,created_at\n${rows.map((x) => `${x.id},${x.user_id},${x.status},${x.total},${x.created_at}`).join("\n")}`); });
  return router;
}
