// createDpopRoute is re-exported from @tidecloak/js so a Next.js app can serve the
// DPoP page without importing a transitive dependency. Runnable with `node --test`
// after `npm run build`. Loads the CommonJS build: the ESM build uses extensionless
// relative imports, which bundlers resolve but plain Node does not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createDpopRoute } = require("../dist/cjs/server/index.js");

const hex = (s) => Buffer.from(s, "utf8").toString("hex");
const config = { "auth-server-url": "https://tc.example.com", realm: "myrealm", resource: "myclient" };
const pageUrl = (issuer, client) =>
  `https://app.example.com/tide_dpop/iss/${hex(issuer)}/aud/${hex(client)}/tide_dpop_auth.html`;

test("serves the DPoP page with the headers TideCloak requires", async () => {
  const { GET } = createDpopRoute({ config });
  const res = await GET(new Request(pageUrl("https://tc.example.com/realms/myrealm", "myclient")));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(res.headers.get("content-security-policy"), /script-src 'self' 'sha256-/);
  assert.equal(res.headers.get("allow-csp-from"), "*");
  assert.match(await res.text(), /window\.opener/);
});

test("rejects a request for another realm or client", async () => {
  const { GET } = createDpopRoute({ config });
  const otherRealm = await GET(new Request(pageUrl("https://tc.example.com/realms/other", "myclient")));
  const otherClient = await GET(new Request(pageUrl("https://tc.example.com/realms/myrealm", "other")));
  assert.notEqual(otherRealm.status, 200);
  assert.notEqual(otherClient.status, 200);
});

test("returns 404 for a path that is not the DPoP page", async () => {
  const { GET } = createDpopRoute({ config });
  const res = await GET(new Request("https://app.example.com/tide_dpop/anything-else"));
  assert.equal(res.status, 404);
});
