import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import bcrypt from "bcryptjs";
import { resetClock } from "./clock.js";
import { currentTestRun, type DatabaseSnapshot } from "./runContext.js";

const dbPath = process.env.DB_PATH || "./data/testlab.db";
if (dbPath !== ":memory:")
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const schema = `PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,name TEXT,password TEXT,role TEXT,locked INTEGER DEFAULT 0,failed_attempts INTEGER DEFAULT 0,verified INTEGER DEFAULT 1,theme TEXT DEFAULT 'light',language TEXT DEFAULT 'en',timezone TEXT DEFAULT 'UTC');
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT UNIQUE,category TEXT,price REAL,inventory INTEGER,status TEXT,version INTEGER DEFAULT 1,updated_at TEXT);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,user_id INTEGER,status TEXT,total REAL,created_at TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT,detail TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS form_submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,data TEXT,created_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS auth_tokens(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,type TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,expires_at TEXT NOT NULL,revoked INTEGER DEFAULT 0,persistent INTEGER DEFAULT 0,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS app_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS product_history(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,action TEXT NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS uploaded_files(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_user_id INTEGER,name TEXT NOT NULL,size INTEGER NOT NULL,mime_type TEXT NOT NULL,sha256 TEXT NOT NULL,data BLOB,created_at TEXT NOT NULL,FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,UNIQUE(owner_user_id,sha256));
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,name TEXT NOT NULL,price REAL NOT NULL,quantity INTEGER NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS wishlists(user_id INTEGER NOT NULL,product_id INTEGER NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,product_id));
CREATE TABLE IF NOT EXISTS lab_otp_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,code TEXT NOT NULL,expires_at TEXT NOT NULL,used INTEGER DEFAULT 0,failed_attempts INTEGER DEFAULT 0,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);`;

const newAuthEpoch = () => randomBytes(32).toString("hex");

function addColumn(database: DatabaseSync, statement: string) {
  try {
    database.exec(statement);
  } catch {
    // Existing databases already contain the migration.
  }
}

export function initializeDatabase(database: DatabaseSync) {
  database.exec(schema);
  addColumn(
    database,
    "ALTER TABLE users ADD COLUMN session_version INTEGER DEFAULT 0",
  );
  addColumn(database, "ALTER TABLE products ADD COLUMN deleted_at TEXT");
  addColumn(database, "ALTER TABLE products ADD COLUMN image_file_id INTEGER");
  addColumn(
    database,
    "ALTER TABLE form_submissions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE",
  );
  addColumn(
    database,
    "ALTER TABLE uploaded_files ADD COLUMN owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
  );
  addColumn(
    database,
    "ALTER TABLE auth_tokens ADD COLUMN persistent INTEGER DEFAULT 0",
  );
  addColumn(
    database,
    "ALTER TABLE lab_otp_messages ADD COLUMN failed_attempts INTEGER DEFAULT 0",
  );

  const uploadedFilesSchema = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='uploaded_files'",
    )
    .get() as { sql: string } | undefined;
  if (
    uploadedFilesSchema &&
    /sha256\s+TEXT\s+UNIQUE/i.test(uploadedFilesSchema.sql)
  ) {
    database.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
    try {
      database.exec(`ALTER TABLE uploaded_files RENAME TO uploaded_files_legacy;
CREATE TABLE uploaded_files(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_user_id INTEGER,name TEXT NOT NULL,size INTEGER NOT NULL,mime_type TEXT NOT NULL,sha256 TEXT NOT NULL,data BLOB,created_at TEXT NOT NULL,FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,UNIQUE(owner_user_id,sha256));
INSERT INTO uploaded_files(id,owner_user_id,name,size,mime_type,sha256,data,created_at) SELECT id,owner_user_id,name,size,mime_type,sha256,data,created_at FROM uploaded_files_legacy;
DROP TABLE uploaded_files_legacy;
COMMIT;`);
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    } finally {
      database.exec("PRAGMA foreign_keys=ON");
    }
  }
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_form_submissions_user_id ON form_submissions(user_id); CREATE INDEX IF NOT EXISTS idx_uploaded_files_owner_user_id ON uploaded_files(owner_user_id); CREATE INDEX IF NOT EXISTS idx_lab_otp_user_id ON lab_otp_messages(user_id);",
  );
  database
    .prepare(
      "INSERT OR IGNORE INTO app_metadata(key,value) VALUES('auth_epoch',?)",
    )
    .run(newAuthEpoch());
}

export function createDatabase(location = ":memory:") {
  const database = new DatabaseSync(location);
  initializeDatabase(database);
  seedDatabase(database);
  return database;
}

const defaultDatabase = new DatabaseSync(dbPath);
initializeDatabase(defaultDatabase);

let defaultDatabaseClosed = false;

export function probeDefaultDatabase() {
  if (defaultDatabaseClosed) throw new Error("Database is closed");
  defaultDatabase.prepare("SELECT 1 AS ready").get();
}

export function closeDefaultDatabase() {
  if (defaultDatabaseClosed) return;
  defaultDatabase.close();
  defaultDatabaseClosed = true;
}

const activeDatabase = () => currentTestRun()?.db || defaultDatabase;

// DatabaseSync methods use native internal slots. Always read and bind a method
// from the selected database instance instead of the Proxy receiver.
export const db = new Proxy(defaultDatabase, {
  get(_target, property) {
    const selected = activeDatabase(),
      value = Reflect.get(selected, property, selected);
    return typeof value === "function" ? value.bind(selected) : value;
  },
  set(_target, property, value) {
    const selected = activeDatabase();
    return Reflect.set(selected, property, value, selected);
  },
}) as DatabaseSync;

function seedUsers(database: DatabaseSync) {
  const users = [
    ["admin@testlab.local", "Test Administrator", "Admin123!", "ADMIN", 0],
    ["user@testlab.local", "Standard User", "User123!", "USER", 0],
    ["viewer@testlab.local", "Read-only User", "Viewer123!", "VIEWER", 0],
    ["locked@testlab.local", "Locked User", "Locked123!", "USER", 1],
  ];
  const statement = database.prepare(
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
  users.forEach(([email, name, password, role, locked], index) =>
    statement.run(
      index + 1,
      email,
      name,
      bcrypt.hashSync(String(password), 10),
      role,
      locked,
    ),
  );
}

function seedProducts(database: DatabaseSync) {
  const product = database.prepare(
      "INSERT INTO products(id,name,category,price,inventory,status,updated_at) VALUES(?,?,?,?,?,?,?)",
    ),
    categories = ["Hardware", "Software", "Accessories"];
  for (let index = 1; index <= 30; index++)
    product.run(
      index,
      `Test Product ${String(index).padStart(3, "0")}`,
      categories[(index - 1) % 3],
      Number((9.99 + index * 3.25).toFixed(2)),
      index === 7 ? 0 : index * 2,
      index === 7 ? "OUT_OF_STOCK" : "ACTIVE",
      "2026-01-01T12:00:00.000Z",
    );
}

function seedOrders(database: DatabaseSync) {
  const order = database.prepare(
    "INSERT INTO orders(id,user_id,status,total,created_at) VALUES(?,?,?,?,?)",
  );
  for (let index = 1; index <= 12; index++)
    order.run(
      1000 + index,
      2,
      index % 3 === 0 ? "DELIVERED" : "PROCESSING",
      50 + index * 12,
      "2026-01-01T12:00:00Z",
    );
  const item = database.prepare(
    "INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES(?,?,?,?,?)",
  );
  for (let index = 1; index <= 12; index++)
    item.run(
      1000 + index,
      index,
      `Test Product ${String(index).padStart(3, "0")}`,
      Number((9.99 + index * 3.25).toFixed(2)),
      1,
    );
}

function seedCommerce(database: DatabaseSync) {
  database.exec(
    "DELETE FROM order_items; DELETE FROM wishlists; DELETE FROM product_history; DELETE FROM products; DELETE FROM orders;",
  );
  seedProducts(database);
  seedOrders(database);
}

function resetSeedProductInventory(database: DatabaseSync) {
  const statement = database.prepare(
    "UPDATE products SET inventory=?,status=?,version=1,updated_at=? WHERE id=?",
  );
  for (let index = 1; index <= 30; index++)
    statement.run(
      index === 7 ? 0 : index * 2,
      index === 7 ? "OUT_OF_STOCK" : "ACTIVE",
      "2026-01-01T12:00:00.000Z",
      index,
    );
}

export function seedDatabase(database: DatabaseSync) {
  seedUsers(database);
  database.exec("UPDATE auth_tokens SET revoked=1 WHERE user_id IN (1,2,3,4);");
  seedCommerce(database);
}

export function seed() {
  seedDatabase(activeDatabase());
}

export const getAuthEpoch = () =>
  (
    activeDatabase()
      .prepare("SELECT value FROM app_metadata WHERE key='auth_epoch'")
      .get() as { value: string }
  ).value;

export const rotateAuthEpoch = () =>
  activeDatabase()
    .prepare("UPDATE app_metadata SET value=? WHERE key='auth_epoch'")
    .run(newAuthEpoch());

export function resetDatabase(database: DatabaseSync) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(
      "DELETE FROM auth_tokens; DELETE FROM audit; DELETE FROM form_submissions; DELETE FROM lab_otp_messages; DELETE FROM product_history; DELETE FROM uploaded_files; DELETE FROM order_items; DELETE FROM wishlists; DELETE FROM users; DELETE FROM sqlite_sequence WHERE name IN ('auth_tokens','audit','form_submissions','lab_otp_messages','product_history','uploaded_files','order_items');",
    );
    database
      .prepare("UPDATE app_metadata SET value=? WHERE key='auth_epoch'")
      .run(newAuthEpoch());
    seedDatabase(database);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function reset() {
  resetDatabase(activeDatabase());
  resetClock();
}

export const SNAPSHOT_TABLES = [
  "users",
  "products",
  "orders",
  "audit",
  "form_submissions",
  "lab_otp_messages",
  "product_history",
  "uploaded_files",
  "order_items",
  "wishlists",
] as const;

const autoincrementTables = [
  "auth_tokens",
  "audit",
  "form_submissions",
  "lab_otp_messages",
  "product_history",
  "uploaded_files",
  "order_items",
] as const;
const SNAPSHOT_SEQUENCE_KEY = "__sqlite_sequence";
const snapshotSequenceTables = autoincrementTables.filter(
  (table) => table !== "auth_tokens",
);

export function captureDatabaseSnapshot(
  database = activeDatabase(),
): DatabaseSnapshot {
  return Object.fromEntries([
    ...SNAPSHOT_TABLES.map((table) => [
      table,
      database.prepare(`SELECT * FROM "${table}"`).all() as Array<
        Record<string, SQLInputValue>
      >,
    ]),
    [
      SNAPSHOT_SEQUENCE_KEY,
      database
        .prepare(
          `SELECT name,seq FROM sqlite_sequence WHERE name IN (${snapshotSequenceTables
            .map((table) => `'${table}'`)
            .join(",")})`,
        )
        .all() as Array<Record<string, SQLInputValue>>,
    ],
  ]);
}

function insertRows(
  database: DatabaseSync,
  table: string,
  rows: Array<Record<string, SQLInputValue>>,
) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]),
    columnSql = columns.map((column) => `"${column}"`).join(","),
    placeholders = columns.map(() => "?").join(","),
    statement = database.prepare(
      `INSERT INTO "${table}"(${columnSql}) VALUES(${placeholders})`,
    );
  for (const row of rows)
    statement.run(...columns.map((column) => row[column]));
}

function rebuildAutoincrementSequences(
  database: DatabaseSync,
  snapshot: DatabaseSnapshot,
) {
  // The table names are a fixed internal allowlist, never request input.
  database.exec(
    `DELETE FROM sqlite_sequence WHERE name IN (${autoincrementTables
      .map((table) => `'${table}'`)
      .join(",")})`,
  );
  const insert = database.prepare(
    "INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)",
  ),
    captured = new Map(
      (snapshot[SNAPSHOT_SEQUENCE_KEY] || []).flatMap((row) => {
        const name = String(row.name || ""),
          sequence = Number(row.seq);
        return snapshotSequenceTables.includes(
          name as (typeof snapshotSequenceTables)[number],
        ) && Number.isSafeInteger(sequence) && sequence >= 0
          ? [[name, sequence] as const]
          : [];
      }),
    );
  for (const table of autoincrementTables) {
    const maximum = Number(
      (
        database
          .prepare(`SELECT COALESCE(MAX(id),0) maximum FROM "${table}"`)
          .get() as {
          maximum: number;
        }
      ).maximum,
    );
    const sequence = Math.max(maximum, captured.get(table) || 0);
    if (sequence > 0) insert.run(table, sequence);
  }
}

export function restoreDatabaseSnapshot(
  snapshot: DatabaseSnapshot,
  database = activeDatabase(),
) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec("DELETE FROM auth_tokens");
    for (const table of [...SNAPSHOT_TABLES].reverse())
      database.exec(`DELETE FROM "${table}"`);
    for (const table of SNAPSHOT_TABLES)
      insertRows(database, table, snapshot[table] || []);
    // Restoring application data must never resurrect a captured login. Rotate
    // both layers used to validate access and refresh sessions.
    database.exec("DELETE FROM auth_tokens");
    database
      .prepare("UPDATE users SET session_version=session_version+1")
      .run();
    database
      .prepare("UPDATE app_metadata SET value=? WHERE key='auth_epoch'")
      .run(newAuthEpoch());
    rebuildAutoincrementSequences(database, snapshot);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export const RESET_MODULES = [
  "auth",
  "forms",
  "catalog",
  "shop",
  "uploads",
] as const;
export type ResetModule = (typeof RESET_MODULES)[number];

export function resetModule(module: ResetModule, database = activeDatabase()) {
  database.exec("BEGIN IMMEDIATE");
  try {
    if (module === "auth") {
      database.exec(
        "DELETE FROM auth_tokens; DELETE FROM audit; DELETE FROM lab_otp_messages; DELETE FROM users WHERE id NOT IN (1,2,3,4);",
      );
      seedUsers(database);
      database
        .prepare("UPDATE app_metadata SET value=? WHERE key='auth_epoch'")
        .run(newAuthEpoch());
    } else if (module === "forms") {
      database.exec(
        "DELETE FROM form_submissions; DELETE FROM sqlite_sequence WHERE name='form_submissions';",
      );
    } else if (module === "uploads") {
      database.exec(
        "UPDATE products SET image_file_id=NULL; DELETE FROM uploaded_files; DELETE FROM sqlite_sequence WHERE name='uploaded_files';",
      );
    } else if (module === "catalog") {
      database.exec(
        "DELETE FROM product_history; DELETE FROM products; DELETE FROM sqlite_sequence WHERE name='product_history';",
      );
      seedProducts(database);
    } else {
      database.exec(
        "DELETE FROM order_items; DELETE FROM wishlists; DELETE FROM orders; DELETE FROM sqlite_sequence WHERE name='order_items';",
      );
      resetSeedProductInventory(database);
      seedOrders(database);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

if (
  Number(
    (
      defaultDatabase.prepare("SELECT COUNT(*) c FROM users").get() as {
        c: number;
      }
    ).c,
  ) === 0
)
  seedDatabase(defaultDatabase);
