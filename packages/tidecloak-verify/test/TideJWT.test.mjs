// Unit tests for @tidecloak/verify. Runnable with: node --test (Node >= 18).
// Uses jose (a runtime dependency) to mint real tokens/JWKS, so these exercise
// the actual signature/issuer/alg/azp/role/clock-skew paths end-to-end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, generateKeyPair, exportJWK } from "jose";

import { verifyTideCloakToken } from "../src/TideJWT.js";

const AUTH_SERVER_URL = "https://issuer.example";
const REALM = "myrealm";
const RESOURCE = "myclient";
const ISSUER = `${AUTH_SERVER_URL}/realms/${REALM}`;

// Build a config whose local JWKS contains `publicJwk` (so no network is needed).
function makeConfig(publicJwk, overrides = {}) {
  return {
    "auth-server-url": AUTH_SERVER_URL,
    realm: REALM,
    resource: RESOURCE,
    jwk: { keys: [publicJwk] },
    ...overrides,
  };
}

// Mint a signed access token. Returns { token, publicJwk }.
async function mintToken({
  alg = "ES256",
  issuer = ISSUER,
  azp = RESOURCE,
  realmRoles = ["offline_access"],
  clientRoles = [],
  expiresIn = "5m",
  iat,
} = {}) {
  const { publicKey, privateKey } = await generateKeyPair(alg);
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";
  publicJwk.alg = alg;
  publicJwk.use = "sig";

  let builder = new SignJWT({
    azp,
    realm_access: { roles: realmRoles },
    resource_access: { [RESOURCE]: { roles: clientRoles } },
  })
    .setProtectedHeader({ alg, kid: "test-key" })
    .setIssuer(issuer)
    .setExpirationTime(expiresIn);
  if (iat !== undefined) builder = builder.setIssuedAt(iat);
  else builder = builder.setIssuedAt();

  const token = await builder.sign(privateKey);
  return { token, publicJwk };
}

test("accepts a valid token and returns the payload", async () => {
  const { token, publicJwk } = await mintToken();
  const payload = await verifyTideCloakToken(makeConfig(publicJwk), token, ["offline_access"]);
  assert.ok(payload, "expected a payload");
  assert.equal(payload.azp, RESOURCE);
});

test("returns null when no token is supplied", async () => {
  const { publicJwk } = await mintToken();
  assert.equal(await verifyTideCloakToken(makeConfig(publicJwk), ""), null);
});

test("rejects a token whose algorithm is not in the allowlist (alg-confusion guard)", async () => {
  const { token, publicJwk } = await mintToken({ alg: "ES256" });
  // Pin the verifier to ES384 only -> an ES256 token must be rejected.
  const cfg = makeConfig(publicJwk, { tokenSignatureAlgorithms: ["ES384"] });
  assert.equal(await verifyTideCloakToken(cfg, token), null);
});

test("rejects a token from the wrong issuer", async () => {
  const { token, publicJwk } = await mintToken({ issuer: "https://evil.example/realms/other" });
  assert.equal(await verifyTideCloakToken(makeConfig(publicJwk), token), null);
});

test("rejects an azp (client) mismatch", async () => {
  const { token, publicJwk } = await mintToken({ azp: "some-other-client" });
  assert.equal(await verifyTideCloakToken(makeConfig(publicJwk), token), null);
});

test("does NOT enforce azp when no resource is configured", async () => {
  const { token, publicJwk } = await mintToken({ azp: "anything" });
  const cfg = makeConfig(publicJwk);
  delete cfg.resource; // no client id configured
  const payload = await verifyTideCloakToken(cfg, token);
  assert.ok(payload, "expected verification to pass without azp enforcement");
});

test("rejects when none of the allowed roles are present", async () => {
  const { token, publicJwk } = await mintToken({ realmRoles: ["user"] });
  assert.equal(await verifyTideCloakToken(makeConfig(publicJwk), token, ["admin"]), null);
});

test("matches a client role as well as realm roles", async () => {
  const { token, publicJwk } = await mintToken({ realmRoles: [], clientRoles: ["editor"] });
  const payload = await verifyTideCloakToken(makeConfig(publicJwk), token, ["editor"]);
  assert.ok(payload);
});

test("rejects an expired token (beyond clock tolerance)", async () => {
  // iat/exp in the past, well outside the 5s default tolerance.
  const { token, publicJwk } = await mintToken({ iat: Math.floor(Date.now() / 1000) - 3600, expiresIn: "-10m" });
  assert.equal(await verifyTideCloakToken(makeConfig(publicJwk), token), null);
});
