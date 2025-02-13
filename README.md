# Heimdall Plus
OpenIDConnect and TideConnect compatible client side JS library. This library was built on top of the existing [keycloak-js](https://www.keycloak.org/securing-apps/javascript-adapter) codebase, so all of keycloak-js' functions are available here, alongside Tide specific addons described below. 

## Tide Specific Add Ons
### Encryption
- Securely encrypt your users' data using the Tide Network. Attach tags to the encryption request to enable fine grained permissions when encrypting/decrypting the data.

- Never manage the keys, just the encrypted data. 

- Encryption is authenticated through the bearer token retrived as part of the OIDC flow.

### Decryption
- Decrypt Tide secured user data. Provide the tags attached when the data was first secured.

### Model Signing
- SSH Authentication Message

- Cardano Transaction

## Installation
### Via npm
```npm install heimdall-plus```

## Initialization
```javascript
import Heimdall from "heimdall-plus"
import tcData from "/tidecloak.json";

const heimdall = new Heimdall({
  url: tcData['auth-server-url'],
  realm: tcData['realm'],
  clientId: tcData['resource'],
  vendorId: tcData['vendorId'],
  homeOrkUrl: tcData['homeOrkUrl']
});
```

## Usage
### Encryption
```javascript
/**
 * @param {[
 * {
 *    encrypted: Uint8Array,
 *    tags: string[]
 * }
 * ]} data
 * @returns Promise<Uint8Array[]>
*/
heimdall.encrypt(data)
```
Example:
```javascript
const encrypted_dob = await heimdall.encrypt([
  {
    "data": "03/04/2005",
    "tags": ["dob"]
  }
])[0];

const multi_encrypted_addresses = await heimdall.encrypt([
  {
    "data": "10 Smith Street",
    "tags": ["street"]
  },
  {
    "data": "Southport",
    "tags": ["suburb"]
  },
  {
    "data": "20 James Street - Burleigh Heads",
    "tags": ["street", "suburb"]
  }
]);
```
