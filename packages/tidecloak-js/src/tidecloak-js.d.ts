import type {
  RequestEnclave as HeimdallRequestEnclave,
  ApprovalEnclave as HeimdallApprovalEnclave,
  ApprovalEnclaveNew,
  TideMemory,
  BaseTideRequest,
} from "heimdall-tide";

/**
 * TideCloak – Keycloak-like client with Tide extensions.
 * This mirrors lib/tidecloak.js.
 */
declare class TideCloak {
  constructor(config: any);

  // lifecycle / state
  didInitialize: boolean;
  authenticated: boolean;
  loginRequired: boolean;

  // tokens
  token?: string;
  tokenParsed?: Record<string, any>;
  refreshToken?: string;
  refreshTokenParsed?: Record<string, any>;
  idToken?: string;
  idTokenParsed?: Record<string, any>;

  // Tide extras
  doken?: string;
  dokenParsed?: Record<string, any>;

  // roles
  realmAccess?: { roles: string[] };
  resourceAccess?: Record<string, { roles: string[] }>;

  // callbacks (Keycloak-style)
  onReady?: (authenticated?: boolean) => void;
  onAuthSuccess?: () => void;
  onAuthError?: (errorData?: any) => void;
  onAuthRefreshSuccess?: () => void;
  onAuthRefreshError?: () => void;
  onAuthLogout?: () => void;
  onTokenExpired?: () => void;
  onActionUpdate?: (
    status: "success" | "cancelled" | "error",
    action?: string
  ) => void;

  // core API – keep options optional to match your usage
  init(initOptions?: any): Promise<boolean>;
  login(options?: any): Promise<void>;
  logout(options?: any): Promise<void>;

  createLoginUrl(options?: any): Promise<string>;
  createLogoutUrl(options?: any): string;

  register(options?: any): Promise<void>;
  createRegisterUrl(options?: any): Promise<string>;

  createAccountUrl(options?: any): string;
  accountManagement(): Promise<void>;

  // Tide helpers
  ensureTokenReady(): Promise<void>;
  encrypt(toEncrypt: any): Promise<any>;
  decrypt(toDecrypt: any): Promise<any>;
  initRequestEnclave(): void;
  initApprovalEnclave(): void;

  // Optional Tide request helpers (if implemented in JS)
  createTideRequest?(encodedRequest: Uint8Array): Promise<Uint8Array>;
  requestTideOperatorApproval?(
    requests: { id: string; request: Uint8Array }[]
  ): Promise<{
    approved: { id: string; request: Uint8Array }[];
    denied: { id: string }[];
    pending: { id: string }[];
  }>;

  // roles
  hasRealmRole(role: string): boolean;
  hasResourceRole(role: string, resource?: string): boolean;

  // user info
  loadUserProfile(): Promise<any>;
  loadUserInfo(): Promise<any>;

  // token lifecycle
  isTokenExpired(minValidity?: number): boolean;
  updateToken(minValidity?: number): Promise<boolean>;
  clearToken(): void;
}

// default export is the IAMService singleton instance
declare const _default: IAMServiceInstance;
export default _default;

/**
 * Hybrid mode OIDC configuration.
 */
export interface HybridOidcConfig {
  /** Authorization endpoint URL (e.g., "https://auth.example.com/realms/myrealm/protocol/openid-connect/auth") */
  authorizationEndpoint: string;
  /** OAuth client ID */
  clientId: string;
  /** Redirect URI for auth callback */
  redirectUri: string;
  /** OAuth scopes (defaults to "openid profile email") */
  scope?: string;
  /** Optional prompt parameter (e.g., "login", "consent") */
  prompt?: string;
}

/**
 * Hybrid mode token exchange configuration.
 */
export interface TokenExchangeConfig {
  /** URL of backend endpoint that exchanges code for tokens */
  endpoint: string;
  /** Provider identifier sent to backend (defaults to "tidecloak-auth") */
  provider?: string;
  /** Custom headers to include with the token exchange request (static object or function returning headers) */
  headers?: Record<string, string> | (() => Record<string, string>);
}

/**
 * Hybrid mode configuration.
 * Browser handles PKCE generation, server handles token exchange.
 */
export interface HybridConfig {
  /** Must be "hybrid" for hybrid mode */
  authMode: "hybrid";
  /** OIDC configuration */
  oidc: HybridOidcConfig;
  /** Token exchange configuration */
  tokenExchange: TokenExchangeConfig;
}

/**
 * Front-channel mode configuration.
 */
export interface FrontChannelConfig {
  /** Optional, defaults to "frontchannel" */
  authMode?: "frontchannel";
  /** Auth server URL */
  "auth-server-url": string;
  /** Realm name */
  realm: string;
  /** Client/resource ID */
  resource: string;
  /** Optional vendor ID for Tide */
  vendorId?: string;
  /** Optional home ORK URL */
  homeOrkUrl?: string;
  /** Optional redirect URI */
  redirectUri?: string;
  /** Client origin auth (keyed by origin) */
  [key: `client-origin-auth-${string}`]: string;
}

/**
 * IAMService configuration (either hybrid or front-channel mode).
 */
export type IAMConfig = HybridConfig | FrontChannelConfig;

/**
 * Hybrid callback data returned by getHybridCallbackData().
 */
export interface HybridCallbackData {
  /** Whether this is a callback page (has code or error in URL) */
  isCallback: boolean;
  /** Authorization code from IdP */
  code: string;
  /** PKCE verifier from sessionStorage */
  verifier: string;
  /** Redirect URI from config */
  redirectUri: string;
  /** Return URL to redirect after auth (from state or sessionStorage) */
  returnUrl: string;
  /** Provider identifier for token exchange */
  provider: string;
  /** Error code from IdP (if auth failed) */
  error: string | null;
  /** Error description from IdP */
  errorDescription: string | null;
}

/**
 * Options for getHybridCallbackData().
 */
export interface HybridCallbackDataOptions {
  /** Whether to clear sessionStorage after reading (default: true) */
  clearStorage?: boolean;
  /** Override redirect URI (use when config isn't loaded after full page navigation) */
  redirectUri?: string;
  /** Override provider identifier (defaults to "tidecloak-auth") */
  provider?: string;
}

/**
 * IAMService event types.
 */
export type IAMEvent =
  | "ready"
  | "initError"
  | "authSuccess"
  | "authError"
  | "authRefreshSuccess"
  | "authRefreshError"
  | "logout"
  | "tokenExpired";

/**
 * IAMService event handler function.
 */
export type IAMEventHandler = (event: IAMEvent, ...args: any[]) => void;

/**
 * IAMService interface for the singleton instance.
 * Supports both front-channel (browser-based tokens) and hybrid (browser PKCE, server token exchange) modes.
 */
export interface IAMServiceInstance {
  /**
   * Register an event listener.
   */
  on(event: IAMEvent, handler: IAMEventHandler): this;

  /**
   * Unregister an event listener.
   */
  off(event: IAMEvent, handler: IAMEventHandler): this;

  /**
   * Check if running in hybrid mode.
   */
  isHybridMode(): boolean;

  /**
   * Load TideCloak configuration.
   */
  loadConfig(config: IAMConfig): Promise<IAMConfig | null>;

  /**
   * Initialize the IAM client.
   * In front-channel mode: performs silent SSO check.
   * In hybrid mode: handles redirect callback if present.
   */
  initIAM(config: IAMConfig, onReady?: IAMEventHandler): Promise<boolean>;

  /**
   * Get the loaded configuration.
   */
  getConfig(): IAMConfig;

  /**
   * Check if user is logged in.
   */
  isLoggedIn(): boolean;

  /**
   * Get valid access token (refreshing if needed).
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  getToken(): Promise<string>;

  /**
   * Get seconds until token expiry.
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  getTokenExp(): number;

  /**
   * Get ID token.
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  getIDToken(): string;

  /**
   * Get username (preferred_username claim).
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  getName(): string;

  /**
   * Get the return URL after successful hybrid authentication.
   * Only available in hybrid mode after successful auth.
   */
  getReturnUrl(): string | null;

  /**
   * Get hybrid callback data for custom token exchange.
   * Use this when you need to handle token exchange with your own auth system
   * instead of IAMService's built-in fetchJson.
   */
  getHybridCallbackData(opts?: HybridCallbackDataOptions): HybridCallbackData;

  /**
   * Check if user has a realm role.
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  hasRealmRole(role: string): boolean;

  /**
   * Check if user has a client role.
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  hasClientRole(role: string, client?: string): boolean;

  /**
   * Get custom claim from access token.
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  getValueFromToken(key: string): any;

  /**
   * Get custom claim from ID token.
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  getValueFromIDToken(key: string): any;

  /**
   * Refresh token if expired or about to expire.
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  updateIAMToken(): Promise<boolean>;

  /**
   * Force immediate token refresh.
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  forceUpdateToken(): Promise<boolean>;

  /**
   * Start login redirect.
   * In hybrid mode, initiates PKCE flow and redirects to IdP.
   * @param returnUrl - URL to redirect to after successful auth (hybrid mode only)
   */
  doLogin(returnUrl?: string): void;

  /**
   * Encrypt data via Tide adapter.
   * Throws in hybrid mode (encryption requires client-side doken).
   */
  doEncrypt(data: any): Promise<any>;

  /**
   * Decrypt data via Tide adapter.
   * Throws in hybrid mode (decryption requires client-side doken).
   */
  doDecrypt(data: any): Promise<any>;

  /**
   * Logout and clear session.
   */
  doLogout(): void;

  /**
   * Get base URL for TideCloak realm.
   * Returns empty string in hybrid mode.
   */
  getBaseUrl(): string;

  /**
   * Get the underlying TideCloak client.
   * Not available in hybrid mode.
   */
  getTideCloakClient(): TideCloak;
}

/**
 * Singleton IAMService instance.
 */
export const IAMService: IAMServiceInstance;

// Tide / Heimdall re-exports
export type RequestEnclave = HeimdallRequestEnclave;
export type ApprovalEnclave = HeimdallApprovalEnclave;
export { ApprovalEnclaveNew, TideMemory, BaseTideRequest };
