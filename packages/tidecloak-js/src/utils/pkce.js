/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0 authorization code flow.
 */

/**
 * Generate random PKCE verifier string.
 * @param {number} len - Length of the verifier (default 96)
 * @returns {string} Random verifier string
 */
export function randomPkceVerifier(len = 96) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += charset[bytes[i] % charset.length];
  }
  return out;
}

/**
 * Base64 URL encode an ArrayBuffer.
 * @param {ArrayBuffer} arrayBuffer - Buffer to encode
 * @returns {string} Base64 URL encoded string
 */
export function base64UrlEncode(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Generate PKCE verifier and challenge.
 * @returns {Promise<{verifier: string, challenge: string, method: string}>}
 */
export async function makePkce() {
  const verifier = randomPkceVerifier(96);
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  const challenge = base64UrlEncode(digest);
  return { verifier, challenge, method: "S256" };
}
