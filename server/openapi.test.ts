import assert from "node:assert/strict";
import test from "node:test";
import { spec } from "./openapi.js";

const httpMethods = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

type OperationRecord = {
  path: string;
  method: string;
  operation: Record<string, any>;
};

const operations = (): OperationRecord[] =>
  Object.entries(spec.paths).flatMap(([path, pathItem]: [string, any]) =>
    Object.entries(pathItem)
      .filter(([method]) => httpMethods.has(method))
      .map(([method, operation]) => ({
        path,
        method,
        operation: operation as Record<string, any>,
      })),
  );

const expectedPaths = [
  "/api/health",
  "/api/ready",
  "/api/auth/register",
  "/api/auth/verify",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/forgot",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/me",
  "/api/auth/session",
  "/api/auth/change-password",
  "/api/forms",
  "/api/forms/{id}",
  "/api/table-users",
  "/api/users",
  "/api/products",
  "/api/products/{id}",
  "/api/products/{id}/duplicate",
  "/api/products/{id}/undo",
  "/api/products/{id}/history",
  "/api/products/{id}/image",
  "/api/files",
  "/api/files/upload",
  "/api/files/{id}",
  "/api/files/process-csv",
  "/api/files/download/{type}",
  "/api/files/download",
  "/api/shop/products",
  "/api/shop/products/{id}",
  "/api/shop/wishlist",
  "/api/shop/wishlist/{productId}",
  "/api/shop/checkout",
  "/api/shop/orders",
  "/api/shop/orders/{id}",
  "/api/shop/orders/{id}/cancel",
  "/api/network/config",
  "/api/network/echo",
  "/api/admin/summary",
  "/api/admin/orders",
  "/api/admin/export",
  "/api/admin/audit",
  "/api/status/{code}",
  "/api/delay/{ms}",
  "/api/advanced/events",
  "/api/advanced/mailbox",
  "/api/advanced/mailbox/code",
  "/api/advanced/mailbox/verify",
  "/api/test/runs",
  "/api/test/runs/{id}",
  "/api/test/clock",
  "/api/test/reset",
  "/api/test/seed",
  "/api/test/network",
  "/api/test/events",
  "/api/test/users/{id}/lock",
  "/api/test/sessions/{userId}/expire",
  "/api/test/snapshots",
  "/api/test/snapshots/{name}/restore",
  "/api/test/snapshots/{name}",
  "/api/test/reset/{module}",
].sort();

test("OpenAPI document has the expected structure and route coverage", () => {
  assert.equal(spec.openapi, "3.0.3");
  assert.equal(typeof spec.info.title, "string");
  assert.equal(typeof spec.info.version, "string");
  assert.deepEqual(Object.keys(spec.paths).sort(), expectedPaths);
  assert.equal(operations().length, 85);
  assert.ok(spec.components.schemas.Error);
  assert.ok(spec.components.securitySchemes.bearerAuth);
  assert.equal(spec.components.parameters.TestKeyHeader.name, "x-test-key");
  assert.equal(
    spec.components.parameters.TestRunIdHeader.name,
    "x-test-run-id",
  );
});

test("every operation is described, uniquely identified, and has responses", () => {
  const operationIds = new Set<string>();
  for (const { path, method, operation } of operations()) {
    const label = `${method.toUpperCase()} ${path}`;
    assert.equal(typeof operation.summary, "string", `${label} summary`);
    assert.ok(operation.summary.length > 0, `${label} summary`);
    assert.equal(
      typeof operation.operationId,
      "string",
      `${label} operationId`,
    );
    assert.ok(
      !operationIds.has(operation.operationId),
      `duplicate operationId ${operation.operationId}`,
    );
    operationIds.add(operation.operationId);
    assert.ok(
      Array.isArray(operation.tags) && operation.tags.length,
      `${label} tags`,
    );
    assert.ok(
      operation.responses && Object.keys(operation.responses).length,
      `${label} responses`,
    );
    assert.ok(
      Array.isArray(operation.security),
      `${label} security declaration`,
    );
  }
});

test("public, authenticated, and test-control operations declare correct security", () => {
  const publicIds = new Set([
    "getHealth",
    "getReadiness",
    "registerUser",
    "verifyEmail",
    "login",
    "refreshSession",
    "logout",
    "forgotPassword",
    "forgotPasswordAlias",
    "resetPassword",
  ]);

  for (const { path, method, operation } of operations()) {
    const label = `${method.toUpperCase()} ${path}`;
    if (publicIds.has(operation.operationId)) {
      assert.deepEqual(operation.security, [], `${label} must be public`);
      continue;
    }

    assert.ok(operation.security.length > 0, `${label} must be secured`);
    if (path === "/api/test/runs" || path === "/api/test/runs/{id}") {
      assert.ok(
        operation.security.every(
          (requirement: Record<string, unknown>) =>
            "testKey" in requirement &&
            !("bearerAuth" in requirement) &&
            !("accessCookie" in requirement),
        ),
        `${label} must use the lifecycle test key without a pre-existing actor`,
      );
    } else if (path.startsWith("/api/test/")) {
      assert.ok(
        operation.security.every(
          (requirement: Record<string, unknown>) =>
            "testKey" in requirement &&
            ("bearerAuth" in requirement || "accessCookie" in requirement),
        ),
        `${label} must combine actor authentication with the test key`,
      );
    } else {
      assert.ok(
        operation.security.some(
          (requirement: Record<string, unknown>) =>
            "bearerAuth" in requirement || "accessCookie" in requirement,
        ),
        `${label} must accept an authenticated session`,
      );
    }
  }
});

test("all local component references resolve", () => {
  const references: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string") references.push(item);
      else visit(item);
    }
  };
  visit(spec);

  for (const reference of references) {
    assert.match(reference, /^#\/components\/(schemas|responses|parameters)\//);
    const segments = reference.slice(2).split("/");
    let current: any = spec;
    for (const segment of segments) current = current?.[segment];
    assert.ok(current, `unresolved reference ${reference}`);
  }
});
