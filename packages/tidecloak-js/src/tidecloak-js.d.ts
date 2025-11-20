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

// default export
export default TideCloak;

/**
 * IAMService – type it loosely for now, can refine later.
 */
export class IAMService {
  [key: string]: any;
}

// Tide / Heimdall re-exports
export type RequestEnclave = HeimdallRequestEnclave;
export type ApprovalEnclave = HeimdallApprovalEnclave;
export { ApprovalEnclaveNew, TideMemory, BaseTideRequest };
