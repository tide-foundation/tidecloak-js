# Front-Channel Mode

The default mode for web apps. Your browser handles login and tokens directly.

---

## How It Works

1. User clicks "Login"
2. Browser redirects to TideCloak login page
3. User logs in
4. TideCloak redirects back to your app with tokens
5. SDK stores tokens in browser

---

## Setup

### 1. Create Config File

Download your adapter config from TideCloak admin console, or create `tidecloak.json`:

```json
{
  "realm": "myrealm",
  "auth-server-url": "https://auth.example.com",
  "resource": "my-app"
}
```

### 2. Create Redirect Page

Create `public/auth/redirect.html`:

```html
<!DOCTYPE html>
<html>
  <head><title>Redirecting...</title></head>
  <body>
    <p>Redirecting...</p>
    <script>
      window.location.href = "/";
    </script>
  </body>
</html>
```

### 3. Initialize SDK

```js
import { IAMService } from "@tidecloak/js";
import config from "./tidecloak.json";

// Set up UI handlers
document.getElementById("login-btn").onclick = () => IAMService.doLogin();
document.getElementById("logout-btn").onclick = () => IAMService.doLogout();

// Listen for events
IAMService
  .on("ready", (loggedIn) => {
    console.log("Auth ready, logged in:", loggedIn);
  })
  .on("authSuccess", () => {
    console.log("Login successful");
  })
  .on("logout", () => {
    console.log("User logged out");
  });

// Start the SDK
await IAMService.initIAM(config);
```

---

## Available Methods

```js
// Check if user is logged in
IAMService.isLoggedIn();  // true or false

// Get the access token (for API calls)
await IAMService.getToken();

// Get user info
IAMService.getName();  // username
IAMService.getValueFromToken("email");  // any token field

// Check roles
IAMService.hasRealmRole("admin");
IAMService.hasClientRole("editor");

// Login and logout
IAMService.doLogin();
IAMService.doLogout();

// Refresh token manually
await IAMService.updateIAMToken();
```

---

## Events

| Event | When it fires |
|-------|---------------|
| `ready` | SDK finished loading (receives true/false for login state) |
| `authSuccess` | User successfully logged in |
| `authError` | Login failed |
| `logout` | User logged out |
| `tokenExpired` | Token expired |

```js
IAMService.on("tokenExpired", () => {
  alert("Your session expired. Please log in again.");
});
```

---

## Custom Redirect URI

By default, users are sent to `/auth/redirect` after login. To change this:

```js
await IAMService.initIAM({
  ...config,
  redirectUri: "https://myapp.com/callback"
});
```

Make sure the new path exists in your app.

---

## Encrypting & Decrypting Data

TideCloak lets you protect sensitive fields with tag-based encryption. You pass in an array of `{ data, tags }` objects and receive an array of encrypted strings.

### Syntax

```js
// Encrypt one or more payloads:
const encryptedArray = await IAMService.doEncrypt([
  { data: /* string or Uint8Array */, tags: ['tag1', 'tag2'] },
]);

// Decrypt one or more encrypted blobs:
const decryptedArray = await IAMService.doDecrypt([
  { encrypted: /* string from encrypt() */, tags: ['tag1', 'tag2'] },
]);
```

### Data Types

The `data` property **must** be either a string or a `Uint8Array` (raw bytes).
- When you encrypt a string, decryption returns a string.
- When you encrypt a `Uint8Array`, decryption returns a `Uint8Array`.

### Valid Example

```js
const encrypted = await IAMService.doEncrypt([
  {
    data: "10 Smith Street",
    tags: ["street"]
  },
  {
    data: "Southport",
    tags: ["suburb"]
  },
  {
    data: "20 James Street - Burleigh Heads",
    tags: ["street", "suburb"]
  }
]);
```

### Invalid Example (will fail)

```js
// Prepare data for encryption
const dataToEncrypt = {
  title: noteData.title,
  content: noteData.content
};

// This will ERROR - objects not allowed
const encryptedArray = await IAMService.doEncrypt([
  { data: dataToEncrypt, tags: ['note'] }
]);

// Instead, stringify objects first:
const encryptedArray = await IAMService.doEncrypt([
  { data: JSON.stringify(dataToEncrypt), tags: ['note'] }
]);
```

### Encryption Example

```js
async function encryptExamples() {
  // Simple single-item encryption:
  const [encryptedDob] = await IAMService.doEncrypt([
    { data: '2005-03-04', tags: ['dob'] }
  ]);

  // Multi-field encryption:
  const encryptedFields = await IAMService.doEncrypt([
    { data: '10 Smith Street', tags: ['street'] },
    { data: 'Southport', tags: ['suburb'] },
    { data: '20 James Street - Burleigh Heads', tags: ['street', 'suburb'] }
  ]);
}
```

### Decryption Example

```js
async function decryptExamples(encryptedFields) {
  // Single-item decryption:
  const [decryptedDob] = await IAMService.doDecrypt([
    { encrypted: encryptedFields[0], tags: ['dob'] }
  ]);

  // Multi-field decryption:
  const decryptedFields = await IAMService.doDecrypt([
    { encrypted: encryptedFields[0], tags: ['street'] },
    { encrypted: encryptedFields[1], tags: ['suburb'] },
    { encrypted: encryptedFields[2], tags: ['street', 'suburb'] }
  ]);
}
```

### Permissions

- Encryption requires `_tide_<tag>.selfencrypt` role
- Decryption requires `_tide_<tag>.selfdecrypt` role
- Users need roles matching **every** tag on a payload
- A payload tagged `['street', 'suburb']` requires both `_tide_street.selfencrypt` and `_tide_suburb.selfencrypt` roles

### Order Guarantee

Output preserves input order - the first item in the input array corresponds to the first item in the output array.
