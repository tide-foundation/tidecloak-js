import { test } from "node:test";
import assert from "node:assert/strict";

import { buildInitOptions } from "../src/utils/initOptions.js";

/**
 * Regression tests for the `TideCloak.init()` option ALLOWLIST.
 *
 * Background: PR #91 (0.13.34-staging) fixed the silent-check-sso redirect URI
 * but ALSO started forwarding `scope`, `redirectUri`, `silentCheckSsoFallback`,
 * `silentCheckSsoTimeout` and a caller-supplied `pkceMethod` from config into
 * `init()`. Those keys had been silently swallowed for the SDK's whole life, so
 * consumers' configs carried values whose behaviour was actually pinned to the
 * SDK defaults. Forwarding them is a silent behaviour change for every existing
 * consumer.
 *
 * `scope` is the sharpest edge: it rewrites the authorization request's scope,
 * which changes the audience/roles on the issued access token and can strip a
 * consumer's Keycloak admin-API access (observable as `401` on `/admin/realms`).
 *
 * These tests pin the allowlist so it cannot be widened by accident again.
 */

/** A config shaped like a real consumer's (the tide-admin console). */
function consoleLikeConfig(extra = {}) {
  return {
    url: "http://localhost:8080",
    realm: "master",
    clientId: "tide-admin-console",
    onLoad: "login-required",
    pkceMethod: "S256",
    responseMode: "query",
    silentCheckSsoRedirectUri:
      "http://localhost:8080/realms/demo/tide-console/silent-check-sso.html",
    silentCheckSsoFallback: true,
    checkLoginIframe: true,
    redirectUri: "http://localhost:8080/realms/demo/tide-console/auth/redirect",
    ...extra,
  };
}

const OPTS = {
  setupRequestEnclave: true,
  silentCheckSsoRedirectUri:
    "http://localhost:8080/realms/demo/tide-console/silent-check-sso.html",
};

test("never forwards `scope` - even when the config sets one", () => {
  const opts = buildInitOptions({
    config: consoleLikeConfig({ scope: "openid profile" }),
    ...OPTS,
  });

  assert.ok(
    !("scope" in opts),
    "`scope` must NOT reach init(): it rewrites the authorization request scope, " +
      "changing the issued token's audience/roles (401 on the Keycloak admin API)."
  );
});

test("never forwards redirectUri / silentCheckSsoFallback / silentCheckSsoTimeout", () => {
  const opts = buildInitOptions({
    config: consoleLikeConfig({ silentCheckSsoTimeout: 3000 }),
    ...OPTS,
  });

  for (const key of [
    "redirectUri",
    "silentCheckSsoFallback",
    "silentCheckSsoTimeout",
  ]) {
    assert.ok(
      !(key in opts),
      `\`${key}\` must NOT reach init() - consumers depend on the SDK default ` +
        "that applied while the option was being swallowed."
    );
  }
});

test("pkceMethod is always S256, never taken from config", () => {
  const opts = buildInitOptions({
    config: consoleLikeConfig({ pkceMethod: false }),
    ...OPTS,
  });

  assert.equal(opts.pkceMethod, "S256");
});

test("onLoad is always check-sso, never taken from config", () => {
  const opts = buildInitOptions({
    // The console really does set `login-required`; honouring it would skip the
    // silent check-sso path entirely.
    config: consoleLikeConfig({ onLoad: "login-required" }),
    ...OPTS,
  });

  assert.equal(opts.onLoad, "check-sso");
});

test("the resolved silentCheckSsoRedirectUri IS forwarded (the PR #91 fix stays)", () => {
  const uri =
    "http://localhost:8080/realms/demo/tide-console/silent-check-sso.html";
  const opts = buildInitOptions({
    config: consoleLikeConfig(),
    setupRequestEnclave: true,
    silentCheckSsoRedirectUri: uri,
  });

  assert.equal(opts.silentCheckSsoRedirectUri, uri);
});

test("an undefined silentCheckSsoRedirectUri is passed through as undefined", () => {
  // => TideCloak skips silent check-sso and falls back to an interactive login,
  // rather than emitting an origin-root URI that would 400.
  const opts = buildInitOptions({
    config: consoleLikeConfig(),
    setupRequestEnclave: true,
    silentCheckSsoRedirectUri: undefined,
  });

  assert.ok("silentCheckSsoRedirectUri" in opts);
  assert.equal(opts.silentCheckSsoRedirectUri, undefined);
});

test("useDPoP and checkLoginIframe are still forwarded (long-standing behaviour)", () => {
  const useDPoP = { mode: "auto", alg: "EdDSA" };
  const opts = buildInitOptions({
    config: consoleLikeConfig({ useDPoP, checkLoginIframe: false }),
    ...OPTS,
  });

  assert.deepEqual(opts.useDPoP, useDPoP);
  assert.equal(opts.checkLoginIframe, false);
});

test("checkLoginIframe is omitted unless it is exactly false", () => {
  const opts = buildInitOptions({
    config: consoleLikeConfig({ checkLoginIframe: true }),
    ...OPTS,
  });

  assert.ok(!("checkLoginIframe" in opts));
});

test("the full option set is exactly the allowlist - nothing leaks through", () => {
  // A config carrying every key we deliberately drop, plus junk.
  const opts = buildInitOptions({
    config: consoleLikeConfig({
      scope: "openid profile email",
      silentCheckSsoTimeout: 3000,
      useDPoP: { mode: "auto", alg: "EdDSA" },
      somethingElseEntirely: "junk",
      vendorId: "abc123",
    }),
    ...OPTS,
  });

  assert.deepEqual(
    Object.keys(opts).sort(),
    [
      "onLoad",
      "pkceMethod",
      "setupRequestEnclave",
      "silentCheckSsoRedirectUri",
      "useDPoP",
    ].sort()
  );
});
