export default class TideCloak {
    /**
     * @param {KeycloakConfig} config
     */
    constructor(config: KeycloakConfig);
    didInitialize: boolean;
    authenticated: boolean;
    loginRequired: boolean;
    /** @type {KeycloakResponseMode} */
    responseMode: KeycloakResponseMode;
    /** @type {KeycloakResponseType} */
    responseType: KeycloakResponseType;
    /** @type {KeycloakFlow} */
    flow: KeycloakFlow;
    /**
     * Matches Keycloak: number | undefined (unset when skew unknown)
     * @type {number | undefined}
     */
    timeSkew: number | undefined;
    /** @type {string=} */
    redirectUri: string | undefined;
    /** @type {string=} */
    silentCheckSsoRedirectUri: string | undefined;
    /** @type {boolean} */
    silentCheckSsoFallback: boolean;
    /** @type {KeycloakPkceMethod} */
    pkceMethod: KeycloakPkceMethod;
    enableLogging: boolean;
    /** @type {'GET' | 'POST'} */
    logoutMethod: "GET" | "POST";
    /** @type {string=} */
    scope: string | undefined;
    /** @type {string | undefined} */
    acrValues: string | undefined;
    messageReceiveTimeout: number;
    /** @type {string=} */
    idToken: string | undefined;
    /** @type {KeycloakTokenParsed=} */
    idTokenParsed: KeycloakTokenParsed | undefined;
    /** @type {string=} */
    token: string | undefined;
    /** @type {KeycloakTokenParsed=} */
    tokenParsed: KeycloakTokenParsed | undefined;
    /** @type {string=} */
    refreshToken: string | undefined;
    /** @type {KeycloakTokenParsed=} */
    refreshTokenParsed: KeycloakTokenParsed | undefined;
    /** @type {string | undefined} */
    doken: string | undefined;
    /** @type {KeycloakTokenParsed | undefined} */
    dokenParsed: KeycloakTokenParsed | undefined;
    /** @type {any} */
    requestEnclave: any;
    /** @type {any} */
    approvalEnclave: any;
    /** @type {string=} */
    clientId: string | undefined;
    /** @type {string=} */
    sessionId: string | undefined;
    /** @type {string=} */
    subject: string | undefined;
    /** @type {string=} */
    authServerUrl: string | undefined;
    /** @type {string=} */
    realm: string | undefined;
    /** @type {KeycloakRoles=} */
    realmAccess: KeycloakRoles | undefined;
    /** @type {KeycloakResourceAccess=} */
    resourceAccess: KeycloakResourceAccess | undefined;
    /** @type {KeycloakProfile=} */
    profile: KeycloakProfile | undefined;
    /** @type {KeycloakUserInfo | undefined} */
    userInfo: KeycloakUserInfo | undefined;
    /** @type {Endpoints} */
    endpoints: Endpoints;
    /** @type {number=} */
    tokenTimeoutHandle: number | undefined;
    /** @type {() => void=} */
    onAuthSuccess: (() => void) | undefined;
    /** @type {(errorData?: KeycloakError) => void=} */
    onAuthError: ((errorData?: KeycloakError) => void) | undefined;
    /** @type {() => void=} */
    onAuthRefreshSuccess: (() => void) | undefined;
    /** @type {() => void=} */
    onAuthRefreshError: (() => void) | undefined;
    /** @type {() => void=} */
    onTokenExpired: (() => void) | undefined;
    /** @type {() => void=} */
    onAuthLogout: (() => void) | undefined;
    /** @type {(authenticated: boolean) => void=} */
    onReady: ((authenticated: boolean) => void) | undefined;
    /** @type {(status: 'success' | 'cancelled' | 'error', action: string) => void=} */
    onActionUpdate: ((status: "success" | "cancelled" | "error", action: string) => void) | undefined;
    /**
     * @param {KeycloakInitOptions} initOptions
     * @returns {Promise<boolean>}
     */
    init(initOptions?: KeycloakInitOptions): Promise<boolean>;
    /**
     * @param {KeycloakLoginOptions} [options]
     * @returns {Promise<void>}
     */
    login(options?: KeycloakLoginOptions): Promise<void>;
    /**
     * Ensure the access token is valid, refreshing if needed.
     * @returns {Promise<void>}
     */
    ensureTokenReady(): Promise<void>;
    /**
     * @param {KeycloakLoginOptions} [options]
     * @returns {Promise<string>}
     */
    createLoginUrl(options?: KeycloakLoginOptions): Promise<string>;
    /**
     * @param {KeycloakLogoutOptions} [options]
     * @returns {Promise<void>}
     */
    logout(options?: KeycloakLogoutOptions): Promise<void>;
    /**
     * @param {KeycloakLogoutOptions} [options]
     * @returns {string}
     */
    createLogoutUrl(options?: KeycloakLogoutOptions): string;
    /**
     * @param {KeycloakRegisterOptions} [options]
     * @returns {Promise<void>}
     */
    register(options?: KeycloakRegisterOptions): Promise<void>;
    /**
     * @param {KeycloakRegisterOptions} [options]
     * @returns {Promise<string>}
     */
    createRegisterUrl(options?: KeycloakRegisterOptions): Promise<string>;
    /**
     * @param {KeycloakAccountOptions} [options]
     * @returns {string}
     */
    createAccountUrl(options?: KeycloakAccountOptions): string;
    /**
     * @returns {Promise<void>}
     */
    accountManagement(): Promise<void>;
    /**
     * @param {string} role
     * @returns {boolean}
     */
    hasRealmRole(role: string): boolean;
    /**
     * @param {string} role
     * @param {string} [resource]
     * @returns {boolean}
     */
    hasResourceRole(role: string, resource?: string): boolean;
    /**
     * @returns {Promise<KeycloakProfile>}
     */
    loadUserProfile(): Promise<KeycloakProfile>;
    /**
     * @returns {Promise<KeycloakUserInfo>}
     */
    loadUserInfo(): Promise<KeycloakUserInfo>;
    /**
     * @param {number} [minValidity]
     * @returns {boolean}
     */
    isTokenExpired(minValidity?: number): boolean;
    /**
     * Matches Keycloak: minValidity is optional.
     * @param {number} [minValidity]
     * @returns {Promise<boolean>}
     */
    updateToken(minValidity?: number): Promise<boolean>;
    clearToken(): void;
    /**
     * Initialize Tide RequestEnclave.
     */
    initRequestEnclave(): void;
    /**
     * Initialize Tide ApprovalEnclave.
     */
    initApprovalEnclave(): void;
    /**
     * Role-based encryption via Tide RequestEnclave.
     * @param {{ data: string | Uint8Array, tags: string[] }[]} toEncrypt
     * @returns {Promise<(string | Uint8Array)[]>}
     */
    encrypt(toEncrypt: {
        data: string | Uint8Array;
        tags: string[];
    }[]): Promise<(string | Uint8Array)[]>;
    /**
     * Initialize a Tide request that requires operator approvals.
     * @param {Uint8Array} encodedRequest
     * @returns {Promise<Uint8Array>}
     */
    createTideRequest(encodedRequest: Uint8Array): Promise<Uint8Array>;
    /**
     * Request Tide operator approval.
     * @param {{id: string, request: Uint8Array}[]} requests
     * @returns {Promise<{ id: string; request: Uint8Array; status: "approved" | "denied" | "pending" }[]>}
     */
    requestTideOperatorApproval(requests: {
        id: string;
        request: Uint8Array;
    }[]): Promise<{
        id: string;
        request: Uint8Array;
        status: "approved" | "denied" | "pending";
    }[]>;
    /**
     * Execute a Tide Sign Request
     * @param {Uint8Array} request
     * @param {boolean} [waitForAll=false]
     * @returns {Promise<Array>} Array of signatures
     */
    executeSignRequest(request: Uint8Array, waitForAll?: boolean): Promise<any[]>;
    /**
     * Role-based decryption via Tide RequestEnclave.
     * @param {{ encrypted: string | Uint8Array, tags: string[] }[]} toDecrypt
     * @returns {Promise<(string | Uint8Array)[]>}
     */
    decrypt(toDecrypt: {
        encrypted: string | Uint8Array;
        tags: string[];
    }[]): Promise<(string | Uint8Array)[]>;
    #private;
}
/**
 * @typedef {Object} NetworkErrorOptionsProperties
 * @property {Response} response
 * @typedef {ErrorOptions & NetworkErrorOptionsProperties} NetworkErrorOptions
 */
export class NetworkError extends Error {
    /**
     * @param {string} message
     * @param {NetworkErrorOptions} options
     */
    constructor(message: string, options: NetworkErrorOptions);
    /** @type {Response} */
    response: Response;
}
/**
 * The JSON version of the adapter configuration.
 */
export type JsonConfig = {
    /**
     * The URL of the authentication server.
     */
    "auth-server-url": string;
    /**
     * The name of the realm.
     */
    realm: string;
    /**
     * The name of the resource, usually the client ID.
     */
    resource: string;
};
/**
 * The successful token response from the authorization server, based on the {@link https://datatracker.ietf.org/doc/html/rfc6749#section-5.1 OAuth 2.0 Authorization Framework specification}.
 */
export type AccessTokenResponse = {
    /**
     * The access token issued by the authorization server.
     */
    access_token: string;
    /**
     * The type of the token issued by the authorization server.
     */
    token_type: string;
    /**
     * The lifetime in seconds of the access token.
     */
    expires_in?: number;
    /**
     * The refresh token issued by the authorization server.
     */
    refresh_token?: string;
    /**
     * The ID token issued by the authorization server, if requested.
     */
    id_token?: string;
    /**
     * The scope of the access token.
     */
    scope?: string;
};
export type Endpoints = {
    authorize: () => string;
    token: () => string;
    logout: () => string;
    checkSessionIframe: () => string;
    thirdPartyCookiesIframe?: (() => string) | undefined;
    register: () => string;
    userinfo: () => string;
};
export type LoginIframe = {
    enable: boolean;
    callbackList: ((error: Error | null, value?: boolean) => void)[];
    interval: number;
    iframe?: HTMLIFrameElement | undefined;
    iframeOrigin?: string | undefined;
};
export type CallbackState = {
    state: string;
    nonce: string;
    redirectUri: string;
    loginOptions?: KeycloakLoginOptions;
    prompt?: KeycloakLoginOptions["prompt"];
    pkceCodeVerifier?: string;
};
export type CallbackStorage = {
    get: (state?: string) => CallbackState | null;
    add: (state: CallbackState) => void;
};
export type NetworkErrorOptionsProperties = {
    response: Response;
};
export type NetworkErrorOptions = ErrorOptions & NetworkErrorOptionsProperties;
export { RequestEnclave, ApprovalEnclave, ApprovalEnclaveNew, TideMemory, BaseTideRequest, PolicySignRequest, Policy, PolicyParameters } from "heimdall-tide";
