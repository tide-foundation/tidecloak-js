# Q-01 — What are the SDK error types and error codes?

## Related gap IDs
- GAP-004

## My answer

There is **no formal error code taxonomy**. The SDK uses a mix of one custom error class, plain `Error` throws with string messages, and event-based error signaling. Errors are identified by message string pattern, not by codes. Here is the full catalog organized by category and retryability.

---

## Custom Error Classes

| Class | Source | Condition | Retryable |
|-------|--------|-----------|-----------|
| `NetworkError` (extends `Error`, includes `.response`) | `tidecloak.js:2744` | Server responds with invalid HTTP status | Yes (transient) |

---

## Policy / Sandbox Errors (ORK-side, propagated to client)

| Error Code / Message | Source | Condition | Retryable |
|----------------------|--------|-----------|-----------|
| `PolicyDecision.Deny("message")` | ork `PolicyDecision.cs` | Policy validation/authorization fails | No (change policy or params) |
| `OutOfGasException` ("Out of gas") | ork `ForsetiSdk.cs:167` | Gas meter exhausted during policy execution | No (reduce policy complexity) |
| `BadPolicy.ForbiddenCall:{target}` | ork `IlVetter.cs` | Policy DLL calls forbidden namespace/type/opcode | No (fix policy code) |
| `BadPolicy.EntryTypeNotFound` | ork `VmHost/Program.cs:241` | Policy entry class not found in DLL | No (fix policy) |
| `BadPolicy.BudgetExceeded:Methods\|Instructions` | ork `IlVetter.cs:173,197` | Policy exceeds method/instruction scanning budget | No (simplify policy) |
| `VmHost.Timeout` | ork `PolicyRuntime.cs:149` | Policy execution exceeded CPU time limit | No (optimize policy) |

---

## Initialization Errors (Fatal)

| Message | Source | Condition | Retryable |
|---------|--------|-----------|-----------|
| `"TideCloak client not initialized - call initIAM() first"` | `IAMService.js:504` | Accessing client before `initIAM()` | No (call `initIAM()` first) |
| `"A 'TideCloak' instance can only be initialized once."` | `tidecloak.js:199` | Re-initializing already-initialized instance | No |
| `"The configuration object is missing the required '${property}' property."` | `tidecloak.js:177` | Required config property absent | No (fix config) |
| `"DPoP is set to strict mode but the server does not advertise DPoP support..."` | `tidecloak.js:305` | DPoP strict mode, server lacks support | No (fix server config or DPoP mode) |

---

## Authentication / Token Errors

| Message | Source | Condition | Retryable |
|---------|--------|-----------|-----------|
| `"Not authenticated"` | `tidecloak.js:1525` | Operation requires auth, user not logged in | No (login first) |
| `"Unable to update token, no refresh token available."` | `tidecloak.js:1553` | Token refresh with no refresh token | No (re-login) |
| `"Invalid nonce."` | `tidecloak.js:1214` | Nonce mismatch in auth response | No (restart login flow) |
| `"Session expired. Please try logging in again."` | `useAuthCallback.ts:186` | Session expired | No (re-login) |
| `authRefreshError` event | `tidecloak.js` | Token refresh failed | Yes (retry once, then re-login) |
| `authError` event | `tidecloak.js` | Authentication error | Depends on cause |

---

## Encryption / Decryption Errors

| Message | Source | Condition | Retryable |
|---------|--------|-----------|-----------|
| `"Pass array as parameter"` | `tidecloak.js:1882` | Input is not an array | No (fix input) |
| `"All entries must be an object to encrypt"` | `tidecloak.js:1889` | Entry is not an object | No (fix input) |
| `"data must be provided as string or Uint8Array..."` | `tidecloak.js:1897` | Wrong data type | No (fix input) |
| `"tags must be provided as a string array..."` | `tidecloak.js:1895` | Tags not a string array | No (fix input) |
| `"User has not been given any access to '${tag}'"` | `tidecloak.js:1905` | User lacks `_tide_${tag}.selfencrypt` or `.selfdecrypt` role | No (assign role) |
| `"[TIDECLOAK] No doken found"` | `tidecloak.js:1801` | Missing delegated token for encryption | Yes (re-auth may fix) |
| `"[TIDECLOAK] Token not parsed"` | `tidecloak.js:1802` | Doken parsing failed | No (corrupted token) |

---

## Tide-JS (WASM layer) Errors

| Message | Source | Condition | Retryable |
|---------|--------|-----------|-----------|
| `"Mismatch between session key private and Doken session key public"` | tide-js `AuthorizedEncryptionFlow.ts:48` | Session key mismatch | No (re-auth) |
| `"Signature must be provided in Tide Serialized Data..."` | tide-js `AuthorizedEncryptionFlow.ts:155` | Missing signature in decrypt payload | No (data integrity issue) |
| `"enclave.networkFailure"` | tide-js `ClientBase.ts:56` | ORK unreachable | Yes (transient) |
| `"enclave.throttled"` | tide-js `Utils.ts:94` | Rate limited by ORK | Yes (backoff) |
| `"enclave.thresholdTimeoutFailure"` | tide-js `Utils.ts:98` | Not enough ORK responses before timeout | Yes (transient) |
| `"${keyType} Orks for this account are down"` | tide-js `Utils.ts:100` | Insufficient ORK responses | Yes (transient) |
| `"Ork.Exceptions.Network.StatusException"` | tide-js `ClientBase.ts:58` | HTTP error from ORK | Depends on status |

---

## DPoP Errors

| Message | Source | Condition | Retryable |
|---------|--------|-----------|-----------|
| `"DPoP requires IndexedDB for secure key storage..."` | `tidecloak-dpop.js:~170` | IndexedDB unavailable | No (environment) |
| `"No supported algorithm available in this browser"` | `tidecloak-dpop.js:~450` | No server-supported alg works in browser | No (environment) |
| `"Requested algorithm '${alg}' is not supported by the server..."` | `tidecloak-dpop.js:~350` | Algorithm mismatch | No (fix config) |

---

## Hybrid Mode Restriction Errors (Fatal)

| Message pattern | Source | Condition | Retryable |
|-----------------|--------|-----------|-----------|
| `"${method}() not available in hybrid mode - tokens are server-side"` | `IAMService.js:531-940` | Calling token-dependent methods in hybrid mode | No (wrong mode) |

---

## Event-Based Error Signals

| Event | Payload | When |
|-------|---------|------|
| `authError` | `Error` object | Auth flow fails |
| `authRefreshError` | `Error` object | Token refresh fails |
| `initError` | `Error` object | Initialization fails |
| `ready` with `false` | boolean | Init completed with error |

---

## Scope
UNIVERSAL

## Confidence
CONFIRMED

## Recommended wording

> The SDK has no error code taxonomy. All errors are plain `Error` instances (one subclass: `NetworkError` with `.response`). Errors are identified by message string. Retryable errors are: `NetworkError`, `enclave.networkFailure`, `enclave.throttled`, `enclave.thresholdTimeoutFailure`, `authRefreshError` (once). Fatal errors include: initialization errors, input validation, missing roles (`User has not been given any access to '${tag}'`), policy violations (`BadPolicy.*`, `OutOfGasException`, `PolicyDecision.Deny()`), and mode restriction errors. Token/auth errors require re-login. Event listeners (`authError`, `authRefreshError`, `initError`) are the primary async error channel.

---

## Notes

- The ORK defines structured error codes (`BadPolicy.*`, `VmHost.*`, `Compile.*`, `PolicyParam.*`) but these are **not systematically surfaced** to the JS client — they arrive as opaque error strings in HTTP responses or enclave failures.
- `doEncrypt()`/`doDecrypt()` throw synchronous input validation errors (wrong type, missing tag role) and asynchronous WASM/ORK errors (network failure, session key mismatch, missing doken).
- There is no retry logic built into the SDK. Consumers must implement their own retry for transient `enclave.*` errors.
- The Doken (delegated token) validates `alg: "EdDSA"` in tide-js (`Doken.ts:133`), which contradicts the SDK default of ES256 — the Doken is a separate server-issued token, not the DPoP proof.
