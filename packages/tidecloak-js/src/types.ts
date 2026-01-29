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
 * Developers implement these functions based on their framework (Electron, Tauri, React Native, etc.).
 */
export interface NativeAdapter {
  // OIDC Configuration
  /** Auth server URL (e.g., "https://auth.example.com") */
  authServerUrl: string;
  /** Realm name */
  realm: string;
  /** Client ID */
  clientId: string;
  /** OAuth scopes (defaults to "openid profile email") */
  scope?: string;

  // Platform-specific functions
  /** Get the redirect URI for this platform (can be async for dynamic URIs) */
  getRedirectUri: () => string | Promise<string>;
  /** Open a URL in the system's external browser */
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
 * For native apps (Electron, Tauri, React Native) that use external browser for login.
 */
export interface NativeConfig {
  /** Must be "native" for native mode */
  authMode: "native";
  /** Native adapter with platform-specific implementations */
  adapter: NativeAdapter;
}
