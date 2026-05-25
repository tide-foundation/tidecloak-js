import { jwtVerify, createLocalJWKSet, createRemoteJWKSet } from "jose";

/**
 * Signature algorithms TideCloak realms issue tokens with. Pinning these prevents
 * algorithm-confusion attacks: without an explicit allowlist `jose` accepts any
 * algorithm a key in the set can validate (and falls back to permissive behaviour
 * for keys that omit an `alg`). Override via `config.tokenSignatureAlgorithms`.
 */
const DEFAULT_ALLOWED_ALGORITHMS = ["ES256", "ES384", "ES512", "EdDSA"];

/**
 * Verify a TideCloak-issued JWT on the server side using your imported config object.
 *
 * @param {object} config - Imported TideCloak configuration (parsed JSON). May also
 *   carry optional `tokenSignatureAlgorithms` (string[]) and `clockTolerance`
 *   (number of seconds, or a jose duration string) to tune verification.
 * @param {string} token - access token to verify.
 * @param {string[]} [allowedRoles] - Array of Tidecloak realm or client roles; user must have at least one.
 * @returns {Promise<object|null>} - The token payload if valid and role-check passes, otherwise null.
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

    // Verify signature (with a pinned algorithm allowlist), issuer and time claims.
    // `clockTolerance` allows a small amount of clock drift between issuer and verifier.
    const algorithms = Array.isArray(config.tokenSignatureAlgorithms) && config.tokenSignatureAlgorithms.length > 0
      ? config.tokenSignatureAlgorithms
      : DEFAULT_ALLOWED_ALGORITHMS;
    const { payload } = await jwtVerify(token, jwkSet, {
      issuer,
      algorithms,
      clockTolerance: config.clockTolerance ?? "5s",
    });

    // Verify authorized party (client). Only enforced when a `resource` (client id)
    // is configured; without this guard an undefined client would reject every token.
    const client = config["resource"];
    if (client !== undefined && client !== null && payload.azp !== client) {
      throw new Error(`AZP mismatch: expected '${client}', got '${payload.azp}'`);
    }

    // Gather all user roles from realm and client roles for the specified resource from the config.
    const realmRoles = payload.realm_access?.roles || [];
    const clientRoles = payload.resource_access?.[client]?.roles || [];
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
    // Log only the message (not the error object, which can echo token-derived
    // data). Note: this collapses both invalid tokens and infrastructure failures
    // (e.g. an unreachable JWKS endpoint) into a `null` result, so callers cannot
    // distinguish "forbidden" from "auth backend down".
    console.error("[TideJWT] Token verification failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
