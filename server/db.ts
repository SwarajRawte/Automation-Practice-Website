import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
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
CREATE TABLE IF NOT EXISTS form_submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,data TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS auth_tokens(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,type TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,expires_at TEXT NOT NULL,revoked INTEGER DEFAULT 0,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);`);
export function seed() {
  const users = [
    ["admin@testlab.local", "Test Lab Admin", "Admin123!", "ADMIN", 0],
    ["user@testlab.local", "Standard User", "User123!", "USER", 0],
    ["viewer@testlab.local", "Read-only User", "Viewer123!", "VIEWER", 0],
    ["locked@testlab.local", "Locked User", "Locked123!", "USER", 1],
  ];
  const u = db.prepare(
    "INSERT OR REPLACE INTO users(id,email,name,password,role,locked,failed_attempts,verified) VALUES(?,?,?,?,?,?,0,1)",
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
  db.exec("DELETE FROM products; DELETE FROM orders;");
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
}
export function reset() {
  db.exec(
    "DELETE FROM auth_tokens; DELETE FROM audit; DELETE FROM form_submissions; DELETE FROM users;",
  );
  seed();
}
if (
  Number(
    (db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c,
  ) === 0
)
  seed();
