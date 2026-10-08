// Tests for the DPoP page route handler. Runnable with `node --test` after
// `npm run build`. Loads the CommonJS build: the ESM build uses extensionless
// relative imports, which bundlers resolve but plain Node does not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createDpopRoute } = require("../dist/cjs/server/index.js");
const { DPOP_AUTH_HTML, DPOP_AUTH_CSP } = require("../dist/cjs/server/generated/dpopAuthAsset.js");
const { build } = require("../scripts/gen-dpop-asset.cjs");

const hex = (s) => Buffer.from(s, "utf8").toString("hex");
const config = { "auth-server-url": "https://tc.example.com/", realm: "myrealm", resource: "myclient" };
const ISSUER = "https://tc.example.com/realms/myrealm";
const pageUrl = (issuer, client) =>
  `https://app.example.com/tide_dpop/iss/${hex(issuer)}/aud/${hex(client)}/tide_dpop_auth.html`;
const OK = pageUrl(ISSUER, "myclient");

test("generated asset matches tide_dpop_auth.html (run npm run build:dpop-asset if not)", () => {
  const fresh = build();
  assert.equal(DPOP_AUTH_HTML, fresh.html);
  assert.equal(DPOP_AUTH_CSP, fresh.csp);
});

test("serves the DPoP page with the headers TideCloak requires, ignoring the query string", async () => {
  const { GET } = createDpopRoute({ config });
  const res = await GET(new Request(`${OK}?version=1&openerOrigin=x`));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.equal(res.headers.get("content-security-policy"), DPOP_AUTH_CSP);
  assert.equal(res.headers.get("allow-csp-from"), "*");
  assert.equal(res.headers.get("x-frame-options"), null);
  assert.equal(await res.text(), DPOP_AUTH_HTML);
});

test("HEAD has headers and no body", async () => {
  const res = await createDpopRoute({ config }).HEAD(new Request(OK, { method: "HEAD" }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("allow-csp-from"), "*");
  assert.equal(await res.text(), "");
});

test("rejects a request for another realm or client", async () => {
  const { GET } = createDpopRoute({ config });
  assert.equal((await GET(new Request(pageUrl("https://tc.example.com/realms/other", "myclient")))).status, 403);
  assert.equal((await GET(new Request(pageUrl(ISSUER, "other")))).status, 403);
});

test("rejects bad hex and other methods", async () => {
  const { GET } = createDpopRoute({ config });
  const badHex = await GET(new Request("https://app.example.com/tide_dpop/iss/80/aud/6d79/tide_dpop_auth.html"));
  assert.equal(badHex.status, 400);
  const post = await GET(new Request(OK, { method: "POST" }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("returns 404 for a path that is not the DPoP page", async () => {
  const { GET } = createDpopRoute({ config });
  for (const p of ["/tide_dpop/anything-else", "/tide_dpop_auth.html", "/tide_dpop/iss/zz/aud/6d79/tide_dpop_auth.html"]) {
    assert.equal((await GET(new Request(`https://app.example.com${p}`))).status, 404, p);
  }
});

test("without a config it serves any issuer and client", async () => {
  assert.equal((await createDpopRoute().GET(new Request(pageUrl("https://x/realms/y", "z")))).status, 200);
  assert.equal((await createDpopRoute({ config: {} }).GET(new Request(OK))).status, 200);
});
