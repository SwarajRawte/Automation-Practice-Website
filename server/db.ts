import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const dbPath = process.env.DB_PATH || "./data/testlab.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,name TEXT,password TEXT,role TEXT,locked INTEGER DEFAULT 0,failed_attempts INTEGER DEFAULT 0,verified INTEGER DEFAULT 1,theme TEXT DEFAULT 'light',language TEXT DEFAULT 'en',timezone TEXT DEFAULT 'UTC');
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT UNIQUE,category TEXT,price REAL,inventory INTEGER,status TEXT,version INTEGER DEFAULT 1,updated_at TEXT);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,user_id INTEGER,status TEXT,total REAL,created_at TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT,detail TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS form_submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,data TEXT,created_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS auth_tokens(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,type TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,expires_at TEXT NOT NULL,revoked INTEGER DEFAULT 0,persistent INTEGER DEFAULT 0,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
db.exec(`CREATE TABLE IF NOT EXISTS product_history(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,action TEXT NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS uploaded_files(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_user_id INTEGER,name TEXT NOT NULL,size INTEGER NOT NULL,mime_type TEXT NOT NULL,sha256 TEXT NOT NULL,data BLOB,created_at TEXT NOT NULL,FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,UNIQUE(owner_user_id,sha256));`);
db.exec(`CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,name TEXT NOT NULL,price REAL NOT NULL,quantity INTEGER NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS wishlists(user_id INTEGER NOT NULL,product_id INTEGER NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,product_id));`);
try {
  db.exec("ALTER TABLE users ADD COLUMN session_version INTEGER DEFAULT 0");
} catch {
  // Existing databases already contain the migration.
}
try {
  db.exec("ALTER TABLE products ADD COLUMN deleted_at TEXT");
} catch {
  // Existing databases already contain the migration.
}
try {
  db.exec("ALTER TABLE products ADD COLUMN image_file_id INTEGER");
} catch {
  // Existing databases already contain the migration.
}
try {
  db.exec(
    "ALTER TABLE form_submissions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE",
  );
} catch {
  // Existing databases already contain the migration.
}
try {
  db.exec(
    "ALTER TABLE uploaded_files ADD COLUMN owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
  );
} catch {
  // Existing databases already contain the migration.
}
try {
  db.exec("ALTER TABLE auth_tokens ADD COLUMN persistent INTEGER DEFAULT 0");
} catch {
  // Existing databases already contain the migration.
}
const uploadedFilesSchema = (
  db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='uploaded_files'",
    )
    .get() as { sql: string }
).sql;
if (/sha256\s+TEXT\s+UNIQUE/i.test(uploadedFilesSchema)) {
  db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
  try {
    db.exec(`ALTER TABLE uploaded_files RENAME TO uploaded_files_legacy;
CREATE TABLE uploaded_files(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_user_id INTEGER,name TEXT NOT NULL,size INTEGER NOT NULL,mime_type TEXT NOT NULL,sha256 TEXT NOT NULL,data BLOB,created_at TEXT NOT NULL,FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,UNIQUE(owner_user_id,sha256));
INSERT INTO uploaded_files(id,owner_user_id,name,size,mime_type,sha256,data,created_at) SELECT id,owner_user_id,name,size,mime_type,sha256,data,created_at FROM uploaded_files_legacy;
DROP TABLE uploaded_files_legacy;
COMMIT;`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys=ON");
  }
}
db.exec(
  "CREATE INDEX IF NOT EXISTS idx_form_submissions_user_id ON form_submissions(user_id); CREATE INDEX IF NOT EXISTS idx_uploaded_files_owner_user_id ON uploaded_files(owner_user_id);",
);
const newAuthEpoch = () => randomBytes(32).toString("hex");
db.prepare(
  "INSERT OR IGNORE INTO app_metadata(key,value) VALUES('auth_epoch',?)",
).run(newAuthEpoch());
export const getAuthEpoch = () =>
  (
    db
      .prepare("SELECT value FROM app_metadata WHERE key='auth_epoch'")
      .get() as { value: string }
  ).value;
export const rotateAuthEpoch = () =>
  db
    .prepare("UPDATE app_metadata SET value=? WHERE key='auth_epoch'")
    .run(newAuthEpoch());
export function seed() {
  const users = [
    ["admin@testlab.local", "Test Administrator", "Admin123!", "ADMIN", 0],
    ["user@testlab.local", "Standard User", "User123!", "USER", 0],
    ["viewer@testlab.local", "Read-only User", "Viewer123!", "VIEWER", 0],
    ["locked@testlab.local", "Locked User", "Locked123!", "USER", 1],
  ];
  const u = db.prepare(
    `INSERT INTO users(id,email,name,password,role,locked,failed_attempts,verified,session_version)
     VALUES(?,?,?,?,?,?,0,1,0)
     ON CONFLICT(id) DO UPDATE SET
       email=excluded.email,
       name=excluded.name,
       password=excluded.password,
       role=excluded.role,
       locked=excluded.locked,
       failed_attempts=0,
       verified=1,
       session_version=users.session_version+1`,
  );
  users.forEach(([email, name, pw, role, locked], index) =>
    u.run(
      index + 1,
      email,
      name,
      bcrypt.hashSync(String(pw), 10),
      role,
      locked,
    ),
  );
  // Reseeding restores the fixed credentials, so existing sessions for those
  // accounts must not survive. Keep the rows for auditability and avoid the
  // DELETE cascades that INSERT OR REPLACE would trigger on user-owned data.
  db.exec(
    "UPDATE auth_tokens SET revoked=1 WHERE user_id IN (1,2,3,4); DELETE FROM order_items; DELETE FROM wishlists; DELETE FROM product_history; DELETE FROM products; DELETE FROM orders;",
  );
  const p = db.prepare(
    "INSERT INTO products(id,name,category,price,inventory,status,updated_at) VALUES(?,?,?,?,?,?,?)",
  );
  const cats = ["Hardware", "Software", "Accessories"];
  for (let i = 1; i <= 30; i++)
    p.run(
      i,
      `Test Product ${String(i).padStart(3, "0")}`,
      cats[(i - 1) % 3],
      Number((9.99 + i * 3.25).toFixed(2)),
      i === 7 ? 0 : i * 2,
      i === 7 ? "OUT_OF_STOCK" : "ACTIVE",
      new Date("2026-01-01T12:00:00Z").toISOString(),
    );
  const o = db.prepare(
    "INSERT INTO orders(id,user_id,status,total,created_at) VALUES(?,?,?,?,?)",
  );
  for (let i = 1; i <= 12; i++)
    o.run(
      1000 + i,
      2,
      i % 3 === 0 ? "DELIVERED" : "PROCESSING",
      50 + i * 12,
      "2026-01-01T12:00:00Z",
    );
  const item = db.prepare(
    "INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES(?,?,?,?,?)",
  );
  for (let i = 1; i <= 12; i++)
    item.run(
      1000 + i,
      i,
      `Test Product ${String(i).padStart(3, "0")}`,
      Number((9.99 + i * 3.25).toFixed(2)),
      1,
    );
}
export function reset() {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(
      "DELETE FROM auth_tokens; DELETE FROM audit; DELETE FROM form_submissions; DELETE FROM product_history; DELETE FROM uploaded_files; DELETE FROM order_items; DELETE FROM wishlists; DELETE FROM users; DELETE FROM sqlite_sequence WHERE name IN ('auth_tokens','audit','form_submissions','product_history','uploaded_files','order_items');",
    );
    rotateAuthEpoch();
    seed();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
if (
  Number(
    (db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c,
  ) === 0
)
  seed();
