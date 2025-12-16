# TideCloak JavaScript SDK (`@tidecloak/js`)

Lightweight browser SDK for integrating TideCloak SSO into any JavaScript application-vanilla, SPA, or framework-agnostic.

---

## 1. Prerequisites

Before you begin, ensure you have:

* A bundler like [Vite](https://vite.dev/) or [Webpack](https://webpack.js.org/)
* A [running](https://github.com/tide-foundation/tidecloak-gettingstarted) TideCloak server
* A registered client in your realm with default user contexts committed
* A valid Keycloak adapter JSON file (e.g., `tidecloak.json`)
* A browser environment (SDK uses `window`, `document.cookie`, etc.)

---

## 2. Project Setup

Start a new project with Vite + TideCloak:

```bash
npm create vite@latest my-app -- --template vanilla
cd my-app
npm install
npm run dev
```

Folder structure:

```
my-app/
├─ index.html
├─ main.js
├─ tidecloak.json
├─ public/
│  └─ auth/
│     └─ redirect.html
├─ package.json
└─ vite.config.js
```

---

## 3. Install `@tidecloak/js`

```bash
npm install @tidecloak/js
# or
yarn add @tidecloak/js
```

This package exports:

* `IAMService` - high-level wrapper and lifecycle manager
* `TideCloak` - lower-level Keycloak-style adapter instance

> **Note:** Installing this package automatically adds a `silent-check-sso.html` file to your `public` directory. This file is required for silent SSO checks; if it doesn’t exist, create it manually at `public/silent-check-sso.html` with the following content, otherwise the app will break:
>
> ```html
> <html>
>   <body>
>     <script>parent.postMessage(location.href, location.origin)</script>
>   </body>
> </html>
> ```

---

## 4. Initialize the SDK

In your main entry file, initialize IAM and register lifecycle listeners. You may also choose to handle lifecycle events such as session expiration here:

**File:** `main.js`

```js
import { IAMService } from "@tidecloak/js";
import config from "./tidecloak.json";

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const statusEl = document.getElementById("status");

loginBtn.onclick = () => IAMService.doLogin();
logoutBtn.onclick = () => IAMService.doLogout();

function updateUI(authenticated) {
  loginBtn.style.display = authenticated ? "none" : "inline-block";
  logoutBtn.style.display = authenticated ? "inline-block" : "none";
  statusEl.textContent = authenticated ? "✅ Authenticated" : "🔒 Please log in";
}

IAMService
  .on("ready", updateUI)
  .on("authError", err => statusEl.textContent = `❌ Auth error: ${err.message}`)
  .on("logout", () => {
    console.log("User logged out");
    updateUI(false);
  })
  .on("tokenExpired", () => {
    alert("Session expired, please log in again");
    updateUI(false);
  });

(async () => {
  try {
    await IAMService.initIAM(config); // You can add redirectUri here if customizing
  } catch (err) {
    console.error("Failed to initialize IAM:", err);
    statusEl.textContent = "❌ Initialization error";
  }
})();
```

**File:** `index.html`

```html
<button id="login-btn">Log In</button>
<button id="logout-btn" style="display:none">Log Out</button>
<div id="status">Initializing...</div>
```

---

## 5. Redirect URI Handling

TideCloak will redirect users after login/logout to a URI defined in your adapter config.

If not explicitly set, the default value is:

```js
`${window.location.origin}/auth/redirect`
```

> This means your app **must contain a static file or route** at `/auth/redirect`.
> In Vite, this typically means adding a file like `public/auth/redirect.html`.

You can override this behavior by passing a `redirectUri` to `initIAM()`:

```js
await IAMService.initIAM({
  ...config,
  redirectUri: "https://yourdomain.com/auth/callback"
});
```

> ⚠️ Regardless of the value used, the **actual route or file must exist** in your deployed project. If the redirect target doesn’t exist, users will land on a 404 page after login/logout.

**File:** `public/auth/redirect.html`

```html
<!-- This file ensures the /auth/redirect path exists -->
<!DOCTYPE html>
<html>
  <head><title>Redirecting...</title></head>
  <body>
    <p>Redirecting, please wait...</p>
    <script>
      // Optionally show loading UI or transition
      // Auth state will be handled once initIAM runs again in your main.js
      window.location.href = "/"; // or redirect elsewhere
    </script>
  </body>
</html>
```

**Description:** This file ensures that the default redirect URI resolves without a 404.

If you override the `redirectUri` in `initIAM`, make sure to **update the corresponding redirect path** and that it exists in `public/` or your router.

---

## 6. Encrypting & Decrypting Data

TideCloak lets you protect sensitive fields with **tag-based** encryption. You pass in an array of `{ data, tags }` objects and receive an array of encrypted strings (or vice versa for decryption).

### Syntax Overview

```ts
// Encrypt one or more payloads:
const encryptedArray = await doEncrypt([
  { data: /* string or Uint8Array */, tags: ['tag1', 'tag2'] },
]);

// Decrypt one or more encrypted blobs:
const decryptedArray = await doDecrypt([
  { encrypted: /* string/Uint8Array from encrypt() */, tags: ['tag1', 'tag2'] },
]);
```

> **Important:** The `data` property **must** be either a string or a `Uint8Array` (raw bytes).\
> When you encrypt a string, decryption returns a string.\
> When you encrypt a `Uint8Array`, decryption returns a `Uint8Array`.

### Valid Example
>
> ```ts
> // Before testing below, ensure you've set up the necessary roles:
> const multi_encrypted_addresses = await doEncrypt([
>   {
>     data: "10 Smith Street",
>     tags: ["street"]
>   },
>   {
>     data: "Southport",
>     tags: ["suburb"]
>   },
>   {
>     data: "20 James Street - Burleigh Heads",
>     tags: ["street", "suburb"]
>   }
> ]);
> ```
>
### Invalid (will fail):
>
> ```ts
> // Prepare data for encryption
> const dataToEncrypt = {
>   title: noteData.title,
>   content: noteData.content
> };
>
> // Encrypt the note data using TideCloak (this will error)
> const encryptedArray = await doEncrypt([{ data: dataToEncrypt, tags: ['note'] }]);
> ```

* **Permissions:** Encryption requires `_tide_<tag>.selfencrypt`; decryption requires `_tide_<tag>.selfdecrypt`.
* **Order guarantee:** Output preserves input order.


---

### Encryption Example

```js
import { IAMService } from "@tidecloak/js";

async function encryptExamples() {
  // Simple single-item encryption:
  const [encryptedDob] = await IAMService.doEncrypt([
    { data: '2005-03-04', tags: ['dob'] }
  ]);

  // Multi-field encryption:
  const encryptedFields = await IAMService.doEncrypt([
    { data: '10 Smith Street', tags: ['street'] },
    { data: 'Southport', tags: ['suburb'] },
    { data: '20 James Street – Burleigh Heads', tags: ['street', 'suburb'] }
  ]);
}
```

> **Permissions**: Users need roles matching **every** tag on a payload. A payload tagged `['street','suburb']` requires both the `_tide_street.selfencrypt` and `_tide_suburb.selfencrypt` roles.

---

### Decryption Example

```js
import { IAMService } from "@tidecloak/js";

async function decryptExamples(encryptedFields) {
  // Single-item decryption:
  const [decryptedDob] = await IAMService.doDecrypt([
    { encrypted: encryptedFields[0], tags: ['dob'] }
  ]);

  // Multi-field decryption:
  const decryptedFields = await IAMService.doDecrypt([
    { encrypted: encryptedFields[0], tags: ['street'] },
    { encrypted: encryptedFields[1], tags: ['suburb'] },
    { encrypted: encryptedFields[2], tags: ['street','suburb'] }
  ]);
}
```

> **Permissions**: Like encryption, decryption requires the same tag-based roles (`_tide_street.selfdecrypt`, `_tide_suburb.selfdecrypt`, etc.).

---

## 7. Executing Custom Tide Requests
This package also allows for custom sign requests to be executed by the Tide Network. Follow this guide to setup up / create your custom request with your own policy: https://github.com/tide-foundation/asgard
### Synatax Overview
```js
let yourCustomTideRequest; // inherits from BaseTideRequest
let request = yourCustomTideRequest.encode();

// Step 1. Initializing the Tide Request - must be executed once per request lifetime
request = await IAMService.initializeRequest(request);

// Step 2. Requesting operator approval of this request - policy you created before contains the logic to determine if a request is ready for commit
let operatorDecision = await IAMService.requestOperatorApproval([{
  id: "01", // can be whatever you want - basic id to help you identify the returned request decisions
  request: request
}]);

// Step 3. Processing operator decisions
// 3.1. Approved operator decisions
operatorDecision.approved.foreach(decision => {
  // Logic to process the approved operator decisions
  let approvedId = decision.id;
  request = decision.request; // keep this approved request as it is the updated request with operator approval. You may discard/overwrite the old one
});

// 3.2. Denied operator decisions
operatorDecision.denied.foreach(decision => {
  // Logic to process the denied operator decisions
  let deniedId = decision.id;
});

// 3.3. Pending operator decisions
operatorDecision.pending.foreach(decision => {
  // Logic to process the pending operator decisions
  let pendingId = decision.id;
});

// Step 4. Execute the request once sufficient operators have approved it. For help determining if the request is ready for commit - see this guide: https://github.com/tide-foundation/asgard
const signatures = await IAMService.executeSignRequest(request); // note a request may return multiple signatures - so the return obj is an array of Uint8Arrays

// Step 5. Use the signature(s) for your application
// It may be a cryptocurrency, SSH, code signing or custom signature. Depends on the Tide Request you created/used.
```

### Signing a new policy using master policy example
Every Tidecloak realm with IGA enabled holds a master policy that is operated by the Tide Realm Admins. 

To retrieve the base64 encoded master policy, query `/tide-policy-resources/admin-policy`. You can then build the policy object with:
```js
const base64decodedBytes = base64decode(queryResponse);
const masterPolicy = new Policy(base64decodedBytes);
```

The following example shows how to sign a new policy for the Test Tide Request, validated against the GenericRealmAccessThresholdRole Contract.
```js
const policyParameters = new Map();
policyParameters.set("threshold", 2); // parameter required by GenericRealmAccessThresholdRole Contract
policyParameters.set("role", "myrole"); // parameter required by GenericRealmAccessThresholdRole Contract

const policy = new Policy({
    version: "1", // default
    modelId: "Test:1", // Test Tide Request Id
    contractId: "GenericRealmAccessThresholdRole:1", // GenericRealmAccessThresholdRole Contract Id
    keyId: "<your vendor id>", // available in tidecloak.json
    params: policyParameters
});

const signRequest = await IAMService.initializeRequest(PolicySignRequest.New(policy).setCustomExpiry(604800).encode()); // create and initialize sign request with 1 week expiry

const operatorDecision = await IAMService.requestOperatorApproval([{
  id: "01",
  request: signRequest
}]);

// Assuming operator approved request
signRequest = operatorDecision.approved[0].request;

// Assuming your Tidecloak realm only has 1 tide realm admin, we can now commit the request
// -- If you have more than 1 tide realm admin, refer to https://github.com/tide-foundation/asgard on how to use the contract validation tests to determine if this request is ready to commit
policy.signature = (await IAMService.executeSignRequest(signRequest))[0]; 

// Store this data
const toStore = policy.encode(); // typeof Uint8Array
```

Now to use that policy we just created for the Test Tide Request:
```js
const testRequestPolicy = new Policy(toStore);

// note: name : version = id
const testRequest = new BaseTideRequest(
  "Test", // name
  "1",  // version
  "Policy:1", // auth flow to use - set to Policy:1 if using policies
  new TextEncoder().encode(JSON.stringify({ SomeStaticData: "draftdata" })), // draft data required by Test Tide Request model
  new TextEncoder().encode(JSON.stringify({ SomeDynamicData: "dynamicdata" })) // dynamic data required by Test Tide Request model
);

testRequest.setCustomExpiry(604800); // 1 week expiry for this request to be approved + committed
testRequest.addPolicy(testRequestPolicy); // set the policy to be used to authorize this request
const request = testRequest.encode();
request = await IAMService.initializeRequest(request);

// Assuming 2 users with realm role "myrole" approves the request
// NOTE: This should only be executed in the context of a user with the realm role "myrole", since the contract/policy authorization states a threshold of 2 users with the myrole realm role must approve this request for it to pass.
request = await IAMService.requestOperatorApproval([{
  id: "01",
  request: request
}]).approved[0].request; // x2

// Validate this signature against your vendor public key
const testSig = (await IAMService.executeSignRequest(request))[0]; 
```

### More Examples
For examples see this list: https://github.com/tide-foundation/asgard

---

## 8. Events & Lifecycle

Register handlers via `.on(event, handler)` or remove with `.off(event, handler)`:

```js
IAMService
  .on("logout", () => console.log("User logged out"))
  .on("tokenExpired", () => alert("Session expired, please log in again"));
```

| Event                | Emitted When…                                                           |
| -------------------- | ----------------------------------------------------------------------- |
| `ready`              | Initial silent-SSO check completes (handler receives `true` or `false`) |
| `initError`          | Config load or init failure                                             |
| `authSuccess`        | Interactive login succeeded                                             |
| `authError`          | Interactive login failed                                                |
| `authRefreshSuccess` | Silent token refresh succeeded                                          |
| `authRefreshError`   | Silent token refresh failed                                             |
| `logout`             | User logged out                                                         |
| `tokenExpired`       | Token expired before refresh                                            |

---

## 9. Core Methods

After initialization, you can call these methods anywhere:

```js
// Check login state
IAMService.isLoggedIn();             // boolean

// Retrieve tokens
await IAMService.getToken();         // string (access token)
IAMService.getIDToken();             // string (ID token)

// Inspect token metadata
IAMService.getTokenExp();            // seconds until expiry
IAMService.getName();                // preferred_username claim

// Role checks
IAMService.hasRealmRole("admin");    // boolean
IAMService.hasClientRole("editor");  // boolean

// Custom claims
IAMService.getValueFromToken("foo"); // any
IAMService.getValueFromIDToken("bar");// any

// Force a token update
await IAMService.updateIAMToken();    // boolean (whether refreshed)
await IAMService.forceUpdateToken();  // boolean

// Programmatic login / logout
IAMService.doLogin();                // redirects to SSO
IAMService.doLogout();               // clears cookie & redirects

// Data encryption / decryption (TideCloak service)
await IAMService.doEncrypt([{ data: { secret: 123 }, tags: ["tag1"] }]);
await IAMService.doDecrypt([{ encrypted: "...", tags: ["tag1"] }]);
```

---

## 10. Tips & Best Practices

* **Single Init**: Call `initIAM` only once on page load or app bootstrap.
* **Token Cookie**: `kcToken` is set automatically; ensure server-side middleware reads this cookie.
* **Error Handling**: Listen to `initError` and `authError` to gracefully recover.
* **Silent Refresh**: Built-in; you only need to call `updateIAMToken` if you want manual control.
* **Event Cleanup**: Use `.off(...)` in SPAs before component unmount.
* **Redirect URI**: If using a custom `redirectUri`, ensure the route or file exists.

---
