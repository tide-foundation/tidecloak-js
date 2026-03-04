/**
 * Type definitions for @tidecloak/js native mode
 */

/**
 * Token data for native mode storage.
 */
export interface NativeTokenData {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  /** Tide doken (delegated token) for encryption/decryption operations */
  doken?: string;
  expiresAt: number;
}

/**
 * Auth callback result from native app.
 */
export interface NativeAuthCallbackResult {
  code?: string;
  error?: string;
  errorDescription?: string;
}

/**
 * Native adapter interface for platform-specific operations.
 *
 * This is the MINIMAL interface developers must implement for their platform.
 * The SDK handles everything else (encryption, token management, etc.).
 *
 * @example
 * ```typescript
 * // Electron example - minimal implementation
 * const adapter: NativeAdapter = {
 *   getRedirectUri: () => 'myapp://auth/callback',
 *   openExternalUrl: (url) => shell.openExternal(url),
 *   onAuthCallback: (callback) => {
 *     ipcRenderer.on('auth-callback', (_, data) => callback(data));
 *     return () => ipcRenderer.off('auth-callback');
 *   },
 *   saveTokens: (tokens) => store.set('tokens', tokens),
 *   getTokens: () => store.get('tokens'),
 *   deleteTokens: () => store.delete('tokens'),
 * };
 * ```
 */
export interface NativeAdapter {
  /** Get the redirect URI for this platform (can be async for dynamic URIs) */
  getRedirectUri: () => string | Promise<string>;

  /** Open a URL in the external browser or popup window */
  openExternalUrl: (url: string) => Promise<void>;

  /** Subscribe to auth callbacks - returns cleanup function */
  onAuthCallback: (callback: (result: NativeAuthCallbackResult) => void) => () => void;

  /** Store tokens securely on the device */
  saveTokens: (tokens: NativeTokenData) => Promise<boolean>;

  /** Retrieve stored tokens */
  getTokens: () => Promise<NativeTokenData | null>;

  /** Delete stored tokens (logout) */
  deleteTokens: () => Promise<boolean>;
}

/**
 * Native mode configuration.
 * All TideCloak configuration is here - the adapter only handles platform-specific operations.
 *
 * @example
 * ```typescript
 * import adapterConfig from './adapter.json';
 *
 * const config: NativeConfig = {
 *   authMode: 'native',
 *   adapter: myAdapter,
 *   // Spread the adapter.json config - it has all the TideCloak settings
 *   ...adapterConfig,
 * };
 * ```
 */
export interface NativeConfig {
  /** Must be "native" for native mode */
  authMode: "native";

  /** Native adapter with platform-specific implementations */
  adapter: NativeAdapter;

  // --- OIDC Configuration (typically from adapter.json) ---

  /** Auth server URL (e.g., "http://localhost:8080") */
  "auth-server-url": string;

  /** Realm name */
  realm: string;

  /** Client ID (resource in adapter.json) */
  resource: string;

  // --- Encryption Configuration (from adapter.json) ---

  /** Tide vendor ID for encryption operations */
  vendorId?: string;

  /** Home ORK URL (e.g., "https://ork1.tideprotocol.com") */
  homeOrkUrl?: string;

  /**
   * Client origin authentication signatures.
   * These are keyed by origin (e.g., "client-origin-auth-http://localhost:5173").
   * The SDK automatically selects the right one based on window.location.origin.
   */
  [key: `client-origin-auth-${string}`]: string;

  backgroundUrl: string;

  logoUrl: string;

  // --- Optional Settings ---

  /** Session mode: 'online' (default) validates tokens, 'offline' accepts stored tokens */
  sessionMode?: 'online' | 'offline';

  /** OAuth scopes (defaults to "openid profile email") */
  scope?: string;

  /** JWK for token verification (from adapter.json) */
  jwk?: {
    keys: Array<{
      kid: string;
      kty: string;
      alg: string;
      use: string;
      crv?: string;
      x?: string;
      [key: string]: unknown;
    }>;
  };
}
