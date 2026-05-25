// Unit tests for the protected-route matcher. Runnable with `node --test` after
// `npm run build` (imports the compiled ESM output). Pure string/regex logic,
// so no Next.js runtime is required - we pass a minimal req stub.
import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizePattern, normalizeProtectedRoutes } from "../dist/esm/server/routerMatcher.js";

const req = (method = "GET") => ({ method });

test("trailing /* glob also matches the bare base path", () => {
  const m = normalizePattern("/admin/*");
  assert.equal(m("/admin", req()), true, "bare /admin should match /admin/*");
  assert.equal(m("/admin/users", req()), true, "/admin/users should match");
  assert.equal(m("/admin/users/42", req()), true, "nested path should match");
});

test("trailing /* glob does not over-match sibling prefixes", () => {
  const m = normalizePattern("/admin/*");
  assert.equal(m("/administrator", req()), false, "/administrator must NOT match /admin/*");
  assert.equal(m("/adminx", req()), false);
  assert.equal(m("/", req()), false);
});

test("mid-path wildcard still works", () => {
  const m = normalizePattern("/api/*/private");
  assert.equal(m("/api/v1/private", req()), true);
  assert.equal(m("/api/v1/public", req()), false);
});

test("plain string is treated as a prefix match", () => {
  const m = normalizePattern("/dashboard");
  assert.equal(m("/dashboard", req()), true);
  assert.equal(m("/dashboard/settings", req()), true);
  assert.equal(m("/other", req()), false);
});

test("RegExp patterns are honoured", () => {
  const m = normalizePattern(/^\/secure\/\d+$/);
  assert.equal(m("/secure/123", req()), true);
  assert.equal(m("/secure/abc", req()), false);
});

test("function patterns are passed through", () => {
  const m = normalizePattern((path) => path.startsWith("/fn"));
  assert.equal(m("/fn/x", req()), true);
  assert.equal(m("/nope", req()), false);
});

test('"OPTIONS" pattern matches on request method', () => {
  const m = normalizePattern("OPTIONS");
  assert.equal(m("/anything", req("OPTIONS")), true);
  assert.equal(m("/anything", req("GET")), false);
});

test("normalizeProtectedRoutes pairs each matcher with its roles", () => {
  const tests = normalizeProtectedRoutes({ "/admin/*": ["admin"], "/user": ["user"] });
  assert.equal(tests.length, 2);
  const adminEntry = tests[0];
  assert.deepEqual(adminEntry.roles, ["admin"]);
  assert.equal(adminEntry.test("/admin", req()), true);
});
