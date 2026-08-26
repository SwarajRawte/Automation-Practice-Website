import test from "node:test";
import assert from "node:assert/strict";
import { db, reset, seed } from "./db.js";

test("seed preserves user-owned records, revokes sessions, and clears stale product history", () => {
  reset();
  db.prepare(
    "INSERT INTO form_submissions(user_id,data,created_at) VALUES(?,?,?)",
  ).run(2, JSON.stringify({ name: "Preserved" }), new Date().toISOString());
  db.prepare(
    "INSERT INTO uploaded_files(owner_user_id,name,size,mime_type,sha256,data,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run(
    2,
    "preserved.txt",
    9,
    "text/plain",
    "seed-preservation-digest",
    Buffer.from("preserved"),
    new Date().toISOString(),
  );
  db.prepare(
    "INSERT INTO auth_tokens(user_id,type,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
  ).run(
    2,
    "refresh",
    "seed-preservation-token",
    new Date(Date.now() + 60_000).toISOString(),
    new Date().toISOString(),
  );
  db.prepare(
    "INSERT INTO product_history(product_id,action,snapshot,created_at) VALUES(?,?,?,?)",
  ).run(1, "UPDATED", "{}", new Date().toISOString());

  seed();

  assert.equal(
    (db.prepare("SELECT COUNT(*) count FROM form_submissions").get() as {
      count: number;
    }).count,
    1,
  );
  assert.equal(
    (
      db
        .prepare("SELECT owner_user_id FROM uploaded_files WHERE name=?")
        .get("preserved.txt") as { owner_user_id: number }
    ).owner_user_id,
    2,
  );
  assert.equal(
    (
      db
        .prepare("SELECT revoked FROM auth_tokens WHERE token_hash=?")
        .get("seed-preservation-token") as { revoked: number }
    ).revoked,
    1,
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) count FROM product_history").get() as {
      count: number;
    }).count,
    0,
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) count FROM products").get() as {
      count: number;
    }).count,
    30,
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) count FROM orders").get() as {
      count: number;
    }).count,
    12,
  );
});

test("reset restores deterministic autoincrement sequences", () => {
  reset();
  const firstId = Number(
    db
      .prepare(
        "INSERT INTO form_submissions(user_id,data,created_at) VALUES(?,?,?)",
      )
      .run(2, "{}", new Date().toISOString()).lastInsertRowid,
  );
  assert.equal(firstId, 1);

  reset();

  const resetId = Number(
    db
      .prepare(
        "INSERT INTO form_submissions(user_id,data,created_at) VALUES(?,?,?)",
      )
      .run(2, "{}", new Date().toISOString()).lastInsertRowid,
  );
  assert.equal(resetId, 1);
});
