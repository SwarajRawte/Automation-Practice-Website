import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { db } from "./db.js";
import { roles } from "./auth.js";
import type { AuthRequest } from "./types.js";
export const phase3Router = Router();
const positiveInteger = (value: unknown, fallback: number, maximum: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0
      ? Math.min(parsed, maximum)
      : fallback;
  },
  finiteNumber = (value: unknown) => {
    if (
      (typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !value.trim())
    )
      return Number.NaN;
    return Number(value);
  },
  productValues = (body: unknown) => {
    const input =
        typeof body === "object" && body !== null && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : {},
      name = typeof input.name === "string" ? input.name.trim() : "",
      category =
        typeof input.category === "string" ? input.category.trim() : "",
      price = finiteNumber(input.price),
      inventory = finiteNumber(input.inventory),
      status =
        typeof input.status === "string" && input.status.trim()
          ? input.status.trim()
          : "ACTIVE";
    return {
      valid:
        Boolean(name) &&
        Boolean(category) &&
        Number.isFinite(price) &&
        price >= 0 &&
        Number.isInteger(inventory) &&
        inventory >= 0,
      name,
      category,
      price,
      inventory,
      status,
    };
  };
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5_000_000 },
});
const tableUsers = Array.from({ length: 100 }, (_, index) => {
  const id = index + 1;
  return {
    id,
    name: `QA User ${String(id).padStart(3, "0")}`,
    email: `qa.user${String(id).padStart(3, "0")}@testlab.local`,
    department: ["Quality", "Engineering", "Product", "Support"][index % 4],
    role: id % 10 === 0 ? "ADMIN" : "USER",
    status: id % 9 === 0 ? "INACTIVE" : "ACTIVE",
    score: 60 + ((id * 7) % 41),
  };
});
phase3Router.get("/table-users", (req, res) => {
  const page = positiveInteger(req.query.page, 1, 1_000_000),
    size = positiveInteger(req.query.size, 10, 100),
    search = String(req.query.search || "").toLowerCase(),
    status = String(req.query.status || ""),
    department = String(req.query.department || ""),
    sort = ["id", "name", "email", "department", "status", "score"].includes(
      String(req.query.sort),
    )
      ? String(req.query.sort)
      : "id",
    direction = req.query.direction === "desc" ? -1 : 1;
  const rows = tableUsers.filter(
    (row) =>
      (!search ||
        Object.values(row).some((value) =>
          String(value).toLowerCase().includes(search),
        )) &&
      (!status || row.status === status) &&
      (!department || row.department === department),
  );
  const sortSpecs = String(
    req.query.sorts || `${sort}:${direction === -1 ? "desc" : "asc"}`,
  )
    .split(",")
    .map((entry) => entry.split(":"))
    .filter(([key]) =>
      ["id", "name", "email", "department", "status", "score"].includes(key),
    );
  rows.sort((a: any, b: any) => {
    for (const [key, order] of sortSpecs) {
      const comparison = String(a[key]).localeCompare(
        String(b[key]),
        undefined,
        {
          numeric: true,
        },
      );
      if (comparison) return comparison * (order === "desc" ? -1 : 1);
    }
    return 0;
  });
  res.json({
    data: rows.slice((page - 1) * size, page * size),
    page,
    size,
    total: rows.length,
    totalPages: Math.ceil(rows.length / size),
  });
});
const productById = (id: string | number) =>
  db
    .prepare("SELECT * FROM products WHERE id=? AND deleted_at IS NULL")
    .get(id) as any;
const history = (id: number, action: string, snapshot: unknown) =>
  db
    .prepare(
      "INSERT INTO product_history(product_id,action,snapshot,created_at) VALUES(?,?,?,?)",
    )
    .run(id, action, JSON.stringify(snapshot), new Date().toISOString());
phase3Router.get("/products", (req, res) => {
  const page = positiveInteger(req.query.page, 1, 1_000_000),
    size = positiveInteger(req.query.size, 10, 100),
    search = `%${String(req.query.q || "")}%`,
    category = String(req.query.category || ""),
    status = String(req.query.status || ""),
    sort = ["id", "name", "price", "inventory", "updated_at"].includes(
      String(req.query.sort),
    )
      ? String(req.query.sort)
      : "id",
    direction = req.query.direction === "desc" ? "DESC" : "ASC";
  const clauses = ["deleted_at IS NULL", "(name LIKE ? OR category LIKE ?)"],
    params: any[] = [search, search];
  if (category) {
    clauses.push("category=?");
    params.push(category);
  }
  if (status) {
    clauses.push("status=?");
    params.push(status);
  }
  const where = clauses.join(" AND "),
    total = (
      db
        .prepare(`SELECT COUNT(*) c FROM products WHERE ${where}`)
        .get(...params) as any
    ).c;
  const data = db
    .prepare(
      `SELECT * FROM products WHERE ${where} ORDER BY ${sort} ${direction} LIMIT ? OFFSET ?`,
    )
    .all(...params, size, (page - 1) * size);
  res.json({ data, page, size, total, totalPages: Math.ceil(total / size) });
});
phase3Router.get("/products/:id", (req, res) => {
  const product = productById(String(req.params.id));
  product
    ? res.json(product)
    : res.status(404).json({ error: "Product not found" });
});
phase3Router.post("/products", roles("ADMIN"), (req: AuthRequest, res) => {
  const values = productValues(req.body);
  if (!values.valid)
    return res.status(422).json({
      error:
        "Name, category, a non-negative price, and a non-negative integer inventory are required",
    });
  try {
    const result = db
        .prepare(
          "INSERT INTO products(name,category,price,inventory,status,version,updated_at) VALUES(?,?,?,?,?,1,?)",
        )
        .run(
          values.name,
          values.category,
          values.price,
          values.inventory,
          values.inventory === 0 ? "OUT_OF_STOCK" : values.status,
          new Date().toISOString(),
        ),
      product = productById(Number(result.lastInsertRowid));
    history(product.id, "CREATED", product);
    res.status(201).json(product);
  } catch {
    return res.status(409).json({ error: "Product name must be unique" });
  }
});
phase3Router.put("/products/:id", roles("ADMIN"), (req, res) => {
  const current = productById(String(req.params.id));
  if (!current) return res.status(404).json({ error: "Product not found" });
  const body =
      typeof req.body === "object" && req.body !== null && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {},
    values = productValues(body);
  if (Number(body.version) !== Number(current.version))
    return res
      .status(409)
      .json({ error: "Concurrent update conflict", current });
  if (!values.valid)
    return res.status(422).json({ error: "Invalid product values" });
  try {
    db.prepare(
      "UPDATE products SET name=?,category=?,price=?,inventory=?,status=?,version=version+1,updated_at=? WHERE id=?",
    ).run(
      values.name,
      values.category,
      values.price,
      values.inventory,
      values.inventory === 0
        ? "OUT_OF_STOCK"
        : values.status,
      new Date().toISOString(),
      current.id,
    );
    const updated = productById(current.id);
    history(current.id, "UPDATED", { before: current, after: updated });
    res.json(updated);
  } catch {
    return res.status(409).json({ error: "Product name must be unique" });
  }
});
phase3Router.post("/products/:id/duplicate", roles("ADMIN"), (req, res) => {
  const current = productById(String(req.params.id));
  if (!current) return res.status(404).json({ error: "Product not found" });
  let suffix = 1,
    name = `${current.name} Copy`;
  while (db.prepare("SELECT id FROM products WHERE name=?").get(name))
    name = `${current.name} Copy ${++suffix}`;
  const result = db
      .prepare(
        "INSERT INTO products(name,category,price,inventory,status,version,updated_at) VALUES(?,?,?,?,?,1,?)",
      )
      .run(
        name,
        current.category,
        current.price,
        current.inventory,
        current.status,
        new Date().toISOString(),
      ),
    copy = productById(Number(result.lastInsertRowid));
  history(copy.id, "DUPLICATED", { sourceId: current.id, ...copy });
  res.status(201).json(copy);
});
phase3Router.delete("/products/:id", roles("ADMIN"), (req, res) => {
  const current = productById(String(req.params.id));
  if (!current) return res.status(404).json({ error: "Product not found" });
  db.prepare(
    "UPDATE products SET deleted_at=?,version=version+1 WHERE id=?",
  ).run(new Date().toISOString(), current.id);
  history(current.id, "DELETED", current);
  res.json({
    message: "Product deleted",
    undoToken: `UNDO-PRODUCT-${current.id}`,
  });
});
phase3Router.post("/products/:id/undo", roles("ADMIN"), (req, res) => {
  if (req.body.undoToken !== `UNDO-PRODUCT-${req.params.id}`)
    return res.status(400).json({ error: "Invalid undo token" });
  const deleted = db
    .prepare("SELECT * FROM products WHERE id=?")
    .get(String(req.params.id)) as any;
  if (!deleted) return res.status(404).json({ error: "Product not found" });
  if (!deleted.deleted_at)
    return res.status(409).json({ error: "Product is not deleted" });
  db.prepare(
    "UPDATE products SET deleted_at=NULL,version=version+1,updated_at=? WHERE id=? AND deleted_at IS NOT NULL",
  ).run(new Date().toISOString(), String(req.params.id));
  const product = productById(String(req.params.id));
  if (!product) return res.status(404).json({ error: "Product not found" });
  history(product.id, "RESTORED", product);
  res.json(product);
});
phase3Router.get("/products/:id/history", (req, res) =>
  res.json({
    data: db
      .prepare(
        "SELECT * FROM product_history WHERE product_id=? ORDER BY id DESC",
      )
      .all(String(req.params.id))
      .map((row: any) => ({ ...row, snapshot: JSON.parse(row.snapshot) })),
  }),
);
phase3Router.post(
  "/products/:id/image",
  roles("ADMIN"),
  imageUpload.single("image"),
  (req, res) => {
    const product = productById(String(req.params.id));
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (!req.file || !["image/png", "image/jpeg"].includes(req.file.mimetype))
      return res
        .status(415)
        .json({ error: "PNG or JPEG product image required" });
    const digest = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");
    let file = db
      .prepare("SELECT id FROM uploaded_files WHERE sha256=?")
      .get(digest) as { id: number } | undefined;
    if (!file) {
      const result = db
        .prepare(
          "INSERT INTO uploaded_files(name,size,mime_type,sha256,data,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          req.file.originalname,
          req.file.size,
          req.file.mimetype,
          digest,
          req.file.buffer,
          new Date().toISOString(),
        );
      file = { id: Number(result.lastInsertRowid) };
    }
    db.prepare(
      "UPDATE products SET image_file_id=?,version=version+1,updated_at=? WHERE id=?",
    ).run(file.id, new Date().toISOString(), product.id);
    const updated = productById(product.id);
    history(product.id, "IMAGE_UPDATED", updated);
    return res.json(updated);
  },
);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5_000_000, files: 5 },
  }),
  allowed = new Set([
    "text/plain",
    "text/csv",
    "application/pdf",
    "image/png",
    "image/jpeg",
  ]);
phase3Router.post("/files/upload", upload.array("files", 5), (req, res, next) => {
  if (req.query.fail === "true")
    return res.status(503).json({ error: "Simulated upload failure" });
  const files = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : [];
  if (!files.length)
    return res.status(422).json({ error: "At least one file is required" });
  const prepared: Array<{ file: Express.Multer.File; digest: string }> = [],
    batchDigests = new Set<string>();
  for (const file of files) {
    if (file.size === 0)
      return res
        .status(422)
        .json({ error: `Zero-byte file rejected: ${file.originalname}` });
    if (!allowed.has(file.mimetype))
      return res
        .status(415)
        .json({ error: `File type not allowed: ${file.mimetype}` });
    const digest = crypto
      .createHash("sha256")
      .update(file.buffer)
      .digest("hex");
    if (
      batchDigests.has(digest) ||
      db.prepare("SELECT id FROM uploaded_files WHERE sha256=?").get(digest)
    )
      return res
        .status(409)
        .json({ error: `Duplicate file: ${file.originalname}` });
    batchDigests.add(digest);
    prepared.push({ file, digest });
  }
  const results = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const { file, digest } of prepared) {
      const result = db
        .prepare(
          "INSERT INTO uploaded_files(name,size,mime_type,sha256,data,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          file.originalname,
          file.size,
          file.mimetype,
          digest,
          file.buffer,
          new Date().toISOString(),
        );
      results.push({
        id: Number(result.lastInsertRowid),
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        preview: file.mimetype.startsWith("image/"),
      });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    return next(error);
  }
  res.status(201).json({ files: results });
});
phase3Router.get("/files", (req, res) =>
  res.json({
    data: db
      .prepare(
        "SELECT id,name,size,mime_type type,created_at FROM uploaded_files ORDER BY id",
      )
      .all(),
  }),
);
phase3Router.delete("/files/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM uploaded_files WHERE id=?")
    .run(String(req.params.id));
  result.changes
    ? res.status(204).end()
    : res.status(404).json({ error: "File not found" });
});
phase3Router.post("/files/process-csv", upload.single("file"), (req, res) => {
  if (!req.file || req.file.mimetype !== "text/csv")
    return res.status(415).json({ error: "CSV file required" });
  const lines = req.file.buffer.toString("utf8").trim().split(/\r?\n/);
  res.json({
    headers: lines[0]?.split(",") || [],
    rows: Math.max(0, lines.length - 1),
    preview: lines.slice(1, 4).map((line) => line.split(",")),
  });
});
phase3Router.get("/files/download/:type", (req, res) => {
  const type = String(req.params.type);
  if (type === "failed")
    return res.status(500).json({ error: "Simulated download failure" });
  const send = () => {
    if (type === "csv")
      return res
        .attachment("test-data.csv")
        .type("text/csv")
        .send("id,name\n1,Deterministic Record\n");
    if (type === "pdf" || type === "invoice")
      return res
        .attachment(type === "invoice" ? "invoice-1001.pdf" : "sample.pdf")
        .type("application/pdf")
        .send(Buffer.from("%PDF-1.4\n% E2E Test Lab deterministic PDF\n%%EOF"));
    return res
      .attachment("test-lab-download.txt")
      .type("text/plain")
      .send("Deterministic E2E Test Lab download\n");
  };
  type === "delayed" ? setTimeout(send, 1200) : send();
});
phase3Router.use((error: any, _req: any, res: any, next: any) => {
  if (error instanceof multer.MulterError)
    return res
      .status(error.code === "LIMIT_FILE_SIZE" ? 413 : 422)
      .json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "Maximum file size is 5 MB"
            : error.message,
      });
  return next(error);
});
