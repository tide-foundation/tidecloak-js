export { RequestEnclave, ApprovalEnclave, ApprovalEnclaveNew, TideMemory, BaseTideRequest, PolicySignRequest, Policy, PolicyParameters } from "heimdall-tide";

export default TideCloak;

export class NetworkError extends Error {
    response: Response;
    constructor(message: string, options: { response: Response });
}

declare class TideCloak {
    constructor(config: KeycloakConfig);

    // Properties
    didInitialize: boolean;
    authenticated: boolean;
    loginRequired: boolean;
    responseMode: KeycloakResponseMode;
    responseType: KeycloakResponseType;
    flow: KeycloakFlow;
    timeSkew: number | undefined;
    redirectUri?: string;
    silentCheckSsoRedirectUri?: string;
    silentCheckSsoFallback: boolean;
    pkceMethod: KeycloakPkceMethod;
    enableLogging: boolean;
    logoutMethod: 'GET' | 'POST';
    scope?: string;
    acrValues?: string;
    messageReceiveTimeout: number;
    idToken?: string;
    idTokenParsed?: KeycloakTokenParsed;
    token?: string;
    tokenParsed?: KeycloakTokenParsed;
    refreshToken?: string;
    refreshTokenParsed?: KeycloakTokenParsed;
    doken?: string;
    dokenParsed?: KeycloakTokenParsed;
    requestEnclave: any;
    approvalEnclave: any;
    clientId?: string;
    sessionId?: string;
    subject?: string;
    authServerUrl?: string;
    realm?: string;
    realmAccess?: KeycloakRoles;
    resourceAccess?: KeycloakResourceAccess;
    profile?: KeycloakProfile;
    userInfo?: KeycloakUserInfo;
    endpoints: Endpoints;
    tokenTimeoutHandle?: number;

    // Callbacks
    onAuthSuccess?: () => void;
    onAuthError?: (errorData?: KeycloakError) => void;
    onAuthRefreshSuccess?: () => void;
    onAuthRefreshError?: () => void;
    onTokenExpired?: () => void;
    onAuthLogout?: () => void;
    onReady?: (authenticated: boolean) => void;
    onActionUpdate?: (status: 'success' | 'cancelled' | 'error', action: string) => void;

    // Methods
    init(initOptions?: KeycloakInitOptions): Promise<boolean>;
    login(options?: KeycloakLoginOptions): Promise<void>;
    ensureTokenReady(): Promise<void>;
    createLoginUrl(options?: KeycloakLoginOptions): Promise<string>;
    logout(options?: KeycloakLogoutOptions): Promise<void>;
    createLogoutUrl(options?: KeycloakLogoutOptions): string;
    register(options?: KeycloakRegisterOptions): Promise<void>;
    createRegisterUrl(options?: KeycloakRegisterOptions): Promise<string>;
    createAccountUrl(options?: KeycloakAccountOptions): string;
    accountManagement(): Promise<void>;
    hasRealmRole(role: string): boolean;
    hasResourceRole(role: string, resource?: string): boolean;
    loadUserProfile(): Promise<KeycloakProfile>;
    loadUserInfo(): Promise<KeycloakUserInfo>;
    isTokenExpired(minValidity?: number): boolean;
    updateToken(minValidity?: number): Promise<boolean>;
    clearToken(): void;
    initRequestEnclave(): void;
    initApprovalEnclave(): void;
    encrypt(toEncrypt: Array<{ data: string | Uint8Array; tags: string[] }>): Promise<Array<string | Uint8Array>>;
    decrypt(toDecrypt: Array<{ encrypted: string | Uint8Array; tags: string[] }>): Promise<Array<string | Uint8Array>>;
    createTideRequest(encodedRequest: Uint8Array): Promise<Uint8Array>;
    requestTideOperatorApproval(requests: Array<{ id: string; request: Uint8Array }>): Promise<{
        approved: Array<{ id: string; request: Uint8Array }>;
        denied: Array<{ id: string }>;
        pending: Array<{ id: string }>;
    }>;
    executeSignRequest(request: Uint8Array): Promise<Uint8Array[]>;
}

// Type definitions

interface Endpoints {
    authorize(): string;
    token(): string;
    logout(): string;
    checkSessionIframe(): string;
    thirdPartyCookiesIframe?(): string;
    register(): string;
    userinfo(): string;
}

type KeycloakResponseMode = 'query' | 'fragment';
type KeycloakResponseType = 'code' | 'id_token token' | 'code id_token token';
type KeycloakFlow = 'standard' | 'implicit' | 'hybrid';
type KeycloakPkceMethod = 'S256' | false;

type KeycloakConfig = string | KeycloakConfigObject | KeycloakOidcConfig;

interface KeycloakConfigObject {
    url: string;
    realm: string;
    clientId: string;
    homeOrkUrl?: string;
    vendorId?: string;
    clientOriginAuth?: string;
}

interface KeycloakOidcConfig {
    clientId: string;
    oidcProvider: string | OpenIdProviderMetadata;
}

interface OpenIdProviderMetadata {
    authorization_endpoint: string;
    token_endpoint: string;
    end_session_endpoint?: string;
    check_session_iframe?: string;
    userinfo_endpoint?: string;
}

interface KeycloakInitOptions {
    adapter?: 'default' | 'cordova' | 'cordova-native' | KeycloakAdapter;
    useNonce?: boolean;
    checkLoginIframe?: boolean;
    checkLoginIframeInterval?: number;
    onLoad?: 'check-sso' | 'login-required';
    responseMode?: KeycloakResponseMode;
    flow?: KeycloakFlow;
    timeSkew?: number;
    redirectUri?: string;
    silentCheckSsoRedirectUri?: string;
    silentCheckSsoFallback?: boolean;
    pkceMethod?: KeycloakPkceMethod;
    enableLogging?: boolean;
    logoutMethod?: 'GET' | 'POST';
    scope?: string;
    acrValues?: string;
    messageReceiveTimeout?: number;
    token?: string;
    refreshToken?: string;
    idToken?: string;
    locale?: string;
}

interface KeycloakLoginOptions {
    redirectUri?: string;
    prompt?: 'none' | 'login' | 'consent';
    maxAge?: number;
    loginHint?: string;
    idpHint?: string;
    action?: string;
    locale?: string;
    acr?: Acr;
    acrValues?: string;
    scope?: string;
    cordovaOptions?: Record<string, string>;
}

interface KeycloakLogoutOptions {
    redirectUri?: string;
    logoutMethod?: 'GET' | 'POST';
}

interface KeycloakRegisterOptions extends KeycloakLoginOptions {}

interface KeycloakAccountOptions {
    redirectUri?: string;
}

interface KeycloakAdapter {
    login(options?: KeycloakLoginOptions): Promise<void>;
    logout(options?: KeycloakLogoutOptions): Promise<void>;
    register(options?: KeycloakRegisterOptions): Promise<void>;
    accountManagement(): Promise<void>;
    redirectUri(options?: { redirectUri?: string }): string;
}

interface KeycloakTokenParsed {
    exp?: number;
    iat?: number;
    nonce?: string;
    sub?: string;
    sid?: string;
    realm_access?: KeycloakRoles;
    resource_access?: KeycloakResourceAccess;
    [key: string]: any;
}

interface KeycloakRoles {
    roles: string[];
}

interface KeycloakResourceAccess {
    [key: string]: KeycloakRoles;
}

interface KeycloakProfile {
    id?: string;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled?: boolean;
    emailVerified?: boolean;
    totp?: boolean;
    createdTimestamp?: number;
    [key: string]: any;
}

interface KeycloakUserInfo {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    preferred_username?: string;
    given_name?: string;
    family_name?: string;
    [key: string]: any;
}

interface KeycloakError {
    error: string;
    error_description?: string;
}

interface Acr {
    values: string[];
    essential?: boolean;
}
