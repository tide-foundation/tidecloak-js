import { jwtVerify, createLocalJWKSet, createRemoteJWKSet } from "jose";

/**
 * Verify a TideCloak-issued JWT on the server side using your imported config object.
 *
 * @param {object} config            Imported TideCloak configuration (parsed JSON).
 * @param {string} token             JWT access token to verify.
 * @param {string[]} [allowedRoles]  Array of Keycloak realm or client roles; user must have at least one.
 * @returns {Promise<object|null>}    The token payload if valid and role-check passes, otherwise null.
 */
export async function verifyTideCloakToken(config, token, allowedRoles = []) {
  try {
    // Ensure token is provided
    if (!token) {
      throw new Error("No token provided");
    }

    // Ensure config is provided
    if (!config || Object.keys(config).length === 0) {
      throw new Error("Could not load TideCloak configuration");
    }

    // Construct issuer URL (ensure slash before 'realms')
    const baseUrl = config["auth-server-url"];
    const sep = baseUrl.endsWith("/") ? "" : "/";
    const issuer = `${baseUrl}${sep}realms/${config.realm}`;

    // Determine JWK set (use local JWKs if provided, otherwise fetch remotely)
    const jwkSet = config.jwk
      ? createLocalJWKSet(config.jwk)
      : createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));

    // Verify token signature and issuer
    const { payload } = await jwtVerify(token, jwkSet, { issuer });

    // Verify authorized party (client)
    if (payload.azp !== config.resource) {
      throw new Error(`AZP mismatch: expected '${config.resource}', got '${payload.azp}'`);
    }

    // Gather all user roles from realm and resource_access
    const realmRoles = payload.realm_access?.roles || [];
    const clientRoles = Object.values(payload.resource_access || {}).flatMap(r => r.roles);
    const allRoles = new Set([...realmRoles, ...clientRoles]);

    // If allowedRoles specified, ensure at least one match
    if (allowedRoles.length > 0) {
      const hasAllowed = allowedRoles.some(role => allRoles.has(role));
      if (!hasAllowed) {
        throw new Error(
          `Role match failed: user roles [${[...allRoles].join(", ")}] do not include any of [${allowedRoles.join(", ")}]`
        );
      }
    }

    return payload;
  } catch (err) {
    console.error("[TideJWT] Token verification failed:", err);
    return null;
  }
}

/**
 * Check if a verified token payload includes a given role.
 *
 * @param {object} payload    Decoded JWT payload.
 * @param {string} role       Role name to check.
 * @returns {boolean}
 */
export function hasRole(payload, role) {
  const realmRoles = payload.realm_access?.roles || [];
  const clientRoles = Object.values(payload.resource_access || {}).flatMap(r => r.roles);
  return [...realmRoles, ...clientRoles].includes(role);
}
