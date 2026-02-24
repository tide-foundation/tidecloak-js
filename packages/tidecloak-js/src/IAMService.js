import { makePkce, fetchJson } from "./utils/index.js";
import TideCloak, { RequestEnclave } from "../lib/tidecloak.js";

/**
 * Singleton IAMService wrapping the TideCloak client.
 *
 * Supports three modes:
 * - **Front-channel mode**: Browser handles all token operations (standard OIDC)
 * - **Hybrid/BFF mode**: Browser handles PKCE, backend exchanges code for tokens (more secure)
 * - **Native mode**: External browser for login, app handles tokens via adapter (Electron, Tauri, React Native)
 *
 * ---
 * ## Front-channel Mode
 *
 * Usage A: pass an onReady callback directly
 * ```js
 * import { IAMService } from '@tidecloak/js';
 * import tidecloakConfig from './tidecloakAdapter.json';
 *
 * IAMService.initIAM(tidecloakConfig, authenticated => {
 *   if (!authenticated) IAMService.doLogin();
 * }).catch(console.error);
 * ```
 *
 * Usage B: attach multiple listeners, then init
 * ```js
 * IAMService
 *   .on('ready', auth => console.log('ready', auth))
 *   .on('authError', err => console.error('Auth failed', err));
 *
 * await IAMService.initIAM(tidecloakConfig);
 * ```
 *
 * ---
 * ## Hybrid/BFF Mode (Backend-For-Frontend)
 *
 * In hybrid mode, the browser generates PKCE and redirects to the IdP, but the
 * backend exchanges the authorization code for tokens. This keeps tokens server-side
 * for improved security.
 *
 * ### Config shape:
 * ```js
 * const hybridConfig = {
 *   authMode: "hybrid",
 *   oidc: {
 *     authorizationEndpoint: "https://auth.example.com/realms/myrealm/protocol/openid-connect/auth",
 *     clientId: "my-client",
 *     redirectUri: "https://app.example.com/auth/callback",
 *     scope: "openid profile email",  // optional, defaults to "openid profile email"
 *     prompt: "login"                 // optional
 *   },
 *   tokenExchange: {
 *     endpoint: "/api/authenticate",  // Backend endpoint that exchanges code for tokens
 *     provider: "tidecloak-auth",     // optional, defaults to "tidecloak-auth"
 *     headers: () => ({               // optional, custom headers (e.g., CSRF token)
 *       "anti-csrf-token": getCSRFToken()
 *     })
 *   }
 * };
 * ```
 *
 * ### Login Page:
 * ```js
 * // Load config and trigger login
 * await IAMService.loadConfig(hybridConfig);
 * IAMService.doLogin("/dashboard");  // returnUrl after successful auth
 * ```
 *
 * ### Redirect/Callback Page:
 * ```js
 * // initIAM handles the callback automatically - exchanges code for tokens via backend
 * const authenticated = await IAMService.initIAM(hybridConfig);
 * if (authenticated) {
 *   const returnUrl = IAMService.getReturnUrl() || "/";
 *   window.location.assign(returnUrl);
 * }
 * ```
 *
 * ### Token Exchange Request Format:
 * The backend endpoint receives a POST request with:
 * ```json
 * {
 *   "accessToken": "{\"code\":\"...\",\"code_verifier\":\"...\",\"redirect_uri\":\"...\"}",
 *   "provider": "tidecloak-auth"
 * }
 * ```
 *
 * ---
 * ## Events
 * - `ready` - Emitted when initialization completes (with authenticated boolean)
 * - `initError` - Emitted when initialization fails
 * - `authSuccess` - Emitted on successful authentication
 * - `authError` - Emitted on authentication failure
 * - `authRefreshSuccess` - Emitted when token refresh succeeds (front-channel only)
 * - `authRefreshError` - Emitted when token refresh fails (front-channel only)
 * - `logout` - Emitted on logout
 * - `tokenExpired` - Emitted when token expires (front-channel only)
 */
class IAMService {
  constructor() {
    this._tc = null;
    this._config = null;
    this._listeners = {};

    // --- Hybrid mode state ---
    this._hybridAuthenticated = false;
    this._hybridReturnUrl = null;
    this._hybridCallbackHandled = false; // Guard against React StrictMode double-execution
    this._hybridCallbackPromise = null; // Promise for pending token exchange (for StrictMode)
    this._cachedCallbackData = null; // Cache for getHybridCallbackData to prevent data loss

    // --- Native mode state ---
    this._nativeAdapter = null;
    this._nativeAuthenticated = false;
    this._nativeTokens = null;
    this._nativeCallbackUnsubscribe = null;
    this._nativeCallbackHandled = false;
    this._nativeCallbackPromise = null;
    this._nativeCallbackProcessing = false; // Guard against concurrent callback processing

    // --- Native mode encryption state ---
    this._nativeDoken = null;
    this._nativeDokenParsed = null;
    this._nativeVoucher = null; // Voucher fetched during login for encryption
    this._nativeRequestEnclave = null;
    this._nativeEncryptionCallbackUnsubscribe = null;
    this._pendingEncryptionRequests = new Map(); // requestId -> { resolve, reject }

    // --- DPoP state ---
    this._dpopProvider = null;
  }

  /**
   * Register an event listener.
   * @param {'ready'|'initError'|'authSuccess'|'authError'|'authRefreshSuccess'|'authRefreshError'|'logout'|'tokenExpired'} event
   * @param {Function} handler
   * @returns {this}
   */
  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
    return this;
  }

  /**
   * Unregister an event listener.
   * @param {string} event
   * @param {Function} handler
   * @returns {this}
   */
  off(event, handler) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(fn => fn !== handler);
    }
    return this;
  }

  /** @private */
  _emit(event, ...args) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(event, ...args); }
      catch (e) { console.error(`Error in "${event}" handler:`, e); }
    });
  }

  /**
   * Check if running in hybrid mode.
   * @returns {boolean}
   */
  isHybridMode() {
    return (this._config?.authMode || "frontchannel").toLowerCase() === "hybrid";
  }

  /**
   * Check if running in native mode.
   * @returns {boolean}
   */
  isNativeMode() {
    return (this._config?.authMode || "frontchannel").toLowerCase() === "native";
  }

  /**
   * Load TideCloak configuration and instantiate the client once.
   * @param {Object} config - TideCloak configuration object.
   * @returns {Promise<Object|null>} The loaded config, or null on failure.
   */
  async loadConfig(config) {
    if (this._config) return this._config;

    if (!config || Object.keys(config).length === 0) {
      console.warn("[loadConfig] empty config");
      return null;
    }
    this._config = config;

    // Hybrid mode: do not construct TideCloak client (tokens are server-side)
    if (this.isHybridMode()) {
      return this._config;
    }

    // Native mode: store adapter, do not construct TideCloak client
    if (this.isNativeMode()) {
      if (!config.adapter) {
        console.error("[loadConfig] Native mode requires config.adapter with platform-specific functions");
        return null;
      }
      this._nativeAdapter = config.adapter;
      return this._config;
    }

    try {
      this._tc = new TideCloak({
        url: config["auth-server-url"],
        realm: config.realm,
        clientId: config.resource,
        vendorId: config.vendorId,
        homeOrkUrl: config.homeOrkUrl,
        clientOriginAuth: config['client-origin-auth-' + window.location.origin],
        backgroundUrl: config['backgroundUrl'],
        logoUrl: config['logoUrl'],
        setupRequestEnclave: config["setupRequestEnclave"] ?? true // set true by default as its most likely for a client to need it
      });
    } catch (err) {
      console.error("[loadConfig] Failed to initialize TideCloak client:", err);
      return null;
    }

    // wire Tidecloak callbacks → our emitter
    this._tc.onReady = auth => this._emit("ready", auth);
    this._tc.onAuthSuccess = () => this._emit("authSuccess");
    this._tc.onAuthError = err => this._emit("authError", err);
    this._tc.onAuthRefreshSuccess = () => this._emit("authRefreshSuccess");
    this._tc.onAuthRefreshError = err => this._emit("authRefreshError", err);
    this._tc.onAuthLogout = () => this._emit("logout");
    this._tc.onTokenExpired = () => this._emit("tokenExpired");

    return this._config;
  }

  /**
   * Initialize the TideCloak SSO client with silent SSO check.
   * In hybrid mode, handles the redirect callback if present.
   * @param {Object} config - TideCloak configuration object.
   * @param {Function} [onReady] - Optional callback for the 'ready' event.
   * @returns {Promise<boolean>} true if authenticated, else false.
   */
  async initIAM(config, onReady) {
    console.debug("[IAMService] Initializing IAM...");
    // register callback on "ready" if provided
    if (typeof onReady === "function") {
      this.on("ready", onReady);
    }

    // no-op on server
    if (typeof window === "undefined") {
      this._emit("initError", new Error("SSR context: cannot initIAM on server"));
      return false;
    }

    // load IAM config
    const loaded = await this.loadConfig(config);
    if (!loaded) {
      this._emit("initError", new Error("Failed to load config"));
      return false;
    }

    // --- Hybrid mode init: handle redirect callback if present ---
    if (this.isHybridMode()) {
      // Guard against React StrictMode double-execution
      if (this._hybridCallbackHandled) {
        console.debug("[IAMService] Hybrid callback already handled");
        // If there's a pending token exchange, wait for it instead of returning stale state
        if (this._hybridCallbackPromise) {
          console.debug("[IAMService] Waiting for pending token exchange...");
          return this._hybridCallbackPromise;
        }
        this._emit("ready", this._hybridAuthenticated);
        return this._hybridAuthenticated;
      }

      // Check if this is a callback page (has code) - mark as handled BEFORE processing
      const qs = new URLSearchParams(window.location.search);
      if (qs.get("code")) {
        this._hybridCallbackHandled = true;
      }

      // Store the promise so subsequent calls can wait for it (React StrictMode)
      this._hybridCallbackPromise = (async () => {
        const { handled, authenticated, returnUrl } = await this._handleHybridRedirectCallback({
          onMissingVerifierRedirectTo: "/login",
        });

        this._hybridReturnUrl = returnUrl || null;

        // If we weren't on a callback page, emit ready with current state (defaults false)
        if (!handled) {
          this._emit("ready", this._hybridAuthenticated);
        }

        // Clear the promise once complete
        this._hybridCallbackPromise = null;

        return authenticated || this._hybridAuthenticated;
      })();

      return this._hybridCallbackPromise;
    }

    // --- Native mode init: check stored tokens and subscribe to callbacks ---
    if (this.isNativeMode()) {
      // Guard against React StrictMode double-execution
      if (this._nativeCallbackHandled) {
        console.debug("[IAMService] Native callback already handled");
        if (this._nativeCallbackPromise) {
          console.debug("[IAMService] Waiting for pending native token exchange...");
          return this._nativeCallbackPromise;
        }
        this._emit("ready", this._nativeAuthenticated);
        return this._nativeAuthenticated;
      }

      // Mark as handled BEFORE creating the promise to prevent
      // React StrictMode double-execution from re-initializing
      this._nativeCallbackHandled = true;

      this._nativeCallbackPromise = (async () => {
        // Initialize DPoP if configured
        if (this._config?.useDPoP && !this._dpopProvider) {
          try {
            const { authServerUrl, realm, clientId } = this._getNativeOIDCConfig();
            const issuerUrl = `${authServerUrl}/realms/${encodeURIComponent(realm)}`;
            const { DPoPSignatureProvider, BrowserSignatureAlgs } = await import('../lib/tidecloak-dpop.js');
            const alg = this._config.useDPoP.alg || 'ES256';
            this._dpopProvider = new DPoPSignatureProvider({
              issuerUrl: new URL(issuerUrl),
              clientId: clientId,
              serverSupportedAlgorithms: [alg],
              requestedAlgorithm: BrowserSignatureAlgs[alg] || BrowserSignatureAlgs.ES256,
            });
            await this._dpopProvider.init();
            console.debug("[IAMService] DPoP initialized for native mode");
          } catch (err) {
            console.warn("[IAMService] Failed to initialize DPoP:", err);
            if (this._config.useDPoP.mode === 'strict') {
              throw err;
            }
            // In 'auto' mode, continue without DPoP
          }
        }

        // Check for stored tokens
        const storedTokens = await this._nativeAdapter.getTokens();
        // sessionMode: 'online' (default) = validate tokens, refresh if needed, require login if invalid
        // sessionMode: 'offline' = accept stored tokens without validation (for offline-first apps)
        const sessionMode = this._config?.sessionMode || 'online';

        if (storedTokens) {
          console.debug("[IAMService] Found stored tokens in native mode, sessionMode:", sessionMode);

          // Load doken if present
          if (storedTokens.doken) {
            this._nativeDoken = storedTokens.doken;
            this._nativeDokenParsed = this._parseToken(storedTokens.doken);
            console.debug("[IAMService] Loaded doken from stored tokens");
          }

          // Load voucher if present
          if (storedTokens.voucher) {
            this._nativeVoucher = storedTokens.voucher;
            console.debug("[IAMService] Loaded voucher from stored tokens");
          }

          if (sessionMode === 'offline') {
            // Offline mode: Accept stored tokens without validation
            this._nativeTokens = storedTokens;
            this._nativeAuthenticated = true;
          } else {
            // Online mode: Validate tokens before accepting
            try {
              const payload = JSON.parse(atob(storedTokens.accessToken.split('.')[1]));
              const exp = payload.exp * 1000;
              const now = Date.now();

              if (exp > now) {
                // Token still valid
                console.debug("[IAMService] Online mode: token valid, authenticating");
                this._nativeTokens = storedTokens;
                this._nativeAuthenticated = true;
              } else if (storedTokens.refreshToken) {
                // Token expired, try refresh
                console.debug("[IAMService] Online mode: token expired, attempting refresh");
                try {
                  const newTokens = await this._refreshNativeToken(storedTokens.refreshToken);
                  this._nativeTokens = newTokens;
                  this._nativeAuthenticated = true;
                  await this._nativeAdapter.saveTokens(newTokens);
                  console.debug("[IAMService] Online mode: token refreshed successfully");
                } catch (refreshErr) {
                  console.debug("[IAMService] Online mode: refresh failed, user must login", refreshErr);
                  await this._nativeAdapter.deleteTokens();
                  this._nativeAuthenticated = false;
                }
              } else {
                // Token expired, no refresh token
                console.debug("[IAMService] Online mode: token expired, no refresh token");
                await this._nativeAdapter.deleteTokens();
                this._nativeAuthenticated = false;
              }
            } catch (parseErr) {
              console.error("[IAMService] Online mode: failed to parse token", parseErr);
              await this._nativeAdapter.deleteTokens();
              this._nativeAuthenticated = false;
            }
          }
        }

        // Subscribe to auth callbacks from native app
        this._nativeCallbackUnsubscribe = this._nativeAdapter.onAuthCallback(
          async ({ code, voucher, error, errorDescription }) => {
            // Guard against duplicate callback processing
            if (this._nativeCallbackProcessing || this._nativeAuthenticated) {
              console.debug("[IAMService] Ignoring duplicate native callback");
              return;
            }
            if (error) {
              console.error("[IAMService] Native auth error:", error, errorDescription);
              this._emit("authError", new Error(`${error}: ${errorDescription || "Unknown error"}`));
              return;
            }
            if (code) {
              await this._handleNativeCallback(code, voucher);
            }
          }
        );

        // Subscribe to encryption callbacks from native app (if adapter supports it)
        if (this._nativeAdapter.onEncryptionCallback) {
          this._nativeEncryptionCallbackUnsubscribe = this._nativeAdapter.onEncryptionCallback(
            ({ operation, requestId, result, error }) => {
              const pending = this._pendingEncryptionRequests.get(requestId);
              if (pending) {
                this._pendingEncryptionRequests.delete(requestId);
                if (error) {
                  pending.reject(new Error(error));
                } else if (result) {
                  pending.resolve(result);
                } else {
                  pending.reject(new Error("Empty result from encryption callback"));
                }
              } else {
                console.warn("[IAMService] Received encryption callback for unknown requestId:", requestId);
              }
            }
          );
        }

        this._emit("ready", this._nativeAuthenticated);
        this._nativeCallbackPromise = null;
        return this._nativeAuthenticated;
      })();

      return this._nativeCallbackPromise;
    }

    // --- Front-channel mode ---
    if (!this._tc) {
      const err = new Error("TideCloak client not available");
      this._emit("initError", err);
      return false;
    }

    if (this._tc.didInitialize) {
      console.debug("[IAMService] IAM Already initialized once.");
      return !!this._tc.tokenParsed;
    }

    let authenticated = false;
    try {
      authenticated = await this._tc.init({
        setupRequestEnclave: config.setupRequestEnclave ?? true, // true by default because most clients that uses this will need it on
        onLoad: "check-sso",
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
        pkceMethod: "S256",
        ...(this._config?.useDPoP && { useDPoP: this._config.useDPoP }),
        ...(this._config?.checkLoginIframe === false && { checkLoginIframe: false }),
      });

      // if successful, store token for middleware
      if (authenticated && this._tc.token) {
        document.cookie = `kcToken=${this._tc.token}; path=/;`;
      }
    } catch (err) {
      console.error("[IAMService] TideCloak init error:", err);
      this._emit("initError", err);
    }

    this._emit("ready", authenticated);
    return authenticated;
  }

  /** @private */
  getTideCloakClient() {
    if (!this._tc) {
      throw new Error("TideCloak client not initialized - call initIAM() first");
    }
    return this._tc;
  }

  /** @returns {Object} Loaded config */
  getConfig() {
    if (!this._config) {
      throw new Error("Config not loaded - call initIAM() first");
    }
    return this._config;
  }

  /** @returns {boolean} Whether there's a valid token (or session in hybrid/native mode) */
  isLoggedIn() {
    if (this.isHybridMode()) return this._hybridAuthenticated;
    if (this.isNativeMode()) return this._nativeAuthenticated;
    return !!this.getTideCloakClient().token;
  }

  /**
   * Get valid token (refreshing if needed).
   * @returns {Promise<string>}
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  async getToken() {
    if (this.isHybridMode()) {
      throw new Error("getToken() not available in hybrid mode - tokens are server-side");
    }
    if (this.isNativeMode()) {
      const tokens = await this._nativeAdapter.getTokens();
      if (!tokens) return null;

      // Check if token is expired or about to expire (30 second buffer)
      const now = Date.now();
      const bufferMs = 30 * 1000;
      if (now >= tokens.expiresAt - bufferMs) {
        console.debug("[IAMService] Native token expired, refreshing...");
        try {
          const newTokens = await this._refreshNativeToken(tokens.refreshToken);
          await this._nativeAdapter.saveTokens(newTokens);
          this._nativeTokens = newTokens;
          return newTokens.accessToken;
        } catch (err) {
          console.error("[IAMService] Native token refresh failed:", err);
          return null;
        }
      }
      return tokens.accessToken;
    }
    const exp = this.getTokenExp();
    if (exp < 3) await this.updateIAMToken();
    return this.getTideCloakClient().token;
  }

  /**
   * Seconds until token expiry.
   * @returns {number}
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  getTokenExp() {
    if (this.isHybridMode()) {
      throw new Error("getTokenExp() not available in hybrid mode - tokens are server-side");
    }
    if (this.isNativeMode()) {
      if (!this._nativeTokens?.accessToken) return 0;
      try {
        const payload = JSON.parse(atob(this._nativeTokens.accessToken.split('.')[1]));
        return Math.round(payload.exp - Date.now() / 1000);
      } catch (e) {
        console.error("[IAMService] Failed to parse token for expiry:", e);
        return 0;
      }
    }
    const kc = this.getTideCloakClient();
    return Math.round(kc.tokenParsed.exp + kc.timeSkew - Date.now() / 1000);
  }

  /**
   * Get ID token.
   * @returns {string}
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  getIDToken() {
    if (this.isHybridMode()) {
      throw new Error("getIDToken() not available in hybrid mode - tokens are server-side");
    }
    if (this.isNativeMode()) {
      return this._nativeTokens?.idToken || null;
    }
    return this.getTideCloakClient().idToken;
  }

  /**
   * Get username (preferred_username claim).
   * @returns {string}
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  getName() {
    if (this.isHybridMode()) {
      throw new Error("getName() not available in hybrid mode - tokens are server-side");
    }
    if (this.isNativeMode()) {
      return this.getValueFromToken('preferred_username');
    }
    return this.getTideCloakClient().tokenParsed.preferred_username;
  }

  /**
   * Get the return URL after successful hybrid authentication.
   * Only available in hybrid mode after successful auth.
   * @returns {string|null}
   */
  getReturnUrl() {
    return this._hybridReturnUrl;
  }

  /**
   * Check if user has a realm role.
   * @param {string} role - the name of the role to check
   * @returns {boolean} Whether the user has a given realm role
   * @throws {Error} In hybrid mode (role checks not available client-side)
   */
  hasRealmRole(role) {
    if (this.isHybridMode()) {
      throw new Error("hasRealmRole() not available in hybrid mode - tokens are server-side");
    }
    if (this.isNativeMode()) {
      if (!this._nativeTokens?.accessToken) return false;
      try {
        const payload = JSON.parse(atob(this._nativeTokens.accessToken.split('.')[1]));
        const realmRoles = payload.realm_access?.roles || [];
        return realmRoles.includes(role);
      } catch (e) {
        console.error("[IAMService] Failed to parse token for realm role check:", e);
        return false;
      }
    }
    return this.getTideCloakClient().hasRealmRole(role);
  }

  /**
   * Check if user has a client role.
   * @param {string} role - the name of the role to check
   * @param {string} [client] - optional client-ID (defaults to the configured adapter resource)
   * @returns {boolean} - whether the user has that role
   * @throws {Error} In hybrid mode (role checks not available client-side)
   */
  hasClientRole(role, client) {
    if (this.isHybridMode()) {
      throw new Error("hasClientRole() not available in hybrid mode - tokens are server-side");
    }
    if (this.isNativeMode()) {
      if (!this._nativeTokens?.accessToken) return false;
      try {
        const payload = JSON.parse(atob(this._nativeTokens.accessToken.split('.')[1]));
        const clientId = client || this._config?.resource;
        const clientRoles = payload.resource_access?.[clientId]?.roles || [];
        return clientRoles.includes(role);
      } catch (e) {
        console.error("[IAMService] Failed to parse token for client role check:", e);
        return false;
      }
    }
    return this.getTideCloakClient().hasResourceRole(role, client);
  }

  /**
   * Get custom claim from access token.
   * @param {string} key - The name of the claim to retrieve from the Access token's payload.
   * @returns {*} Custom claim from access token
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  getValueFromToken(key) {
    if (this.isHybridMode()) {
      throw new Error("getValueFromToken() not available in hybrid mode - tokens are server-side");
    }
    if (this.isNativeMode()) {
      if (!this._nativeTokens?.accessToken) return null;
      try {
        const payload = JSON.parse(atob(this._nativeTokens.accessToken.split('.')[1]));
        return payload[key] !== undefined ? payload[key] : null;
      } catch (e) {
        console.error("[IAMService] Failed to parse access token:", e);
        return null;
      }
    }
    return this.getTideCloakClient().tokenParsed[key] ?? null;
  }

  /**
   * Get custom claim from ID token.
   * @param {string} key - The name of the claim to retrieve from the ID token's payload.
   * @returns {*} Custom claim from ID token
   * @throws {Error} In hybrid mode (tokens are server-side)
   */
  getValueFromIDToken(key) {
    if (this.isHybridMode()) {
      throw new Error("getValueFromIDToken() not available in hybrid mode - tokens are server-side");
    }
    if (this.isNativeMode()) {
      if (!this._nativeTokens?.idToken) return null;
      try {
        const payload = JSON.parse(atob(this._nativeTokens.idToken.split('.')[1]));
        return payload[key] !== undefined ? payload[key] : null;
      } catch (e) {
        console.error("[IAMService] Failed to parse ID token:", e);
        return null;
      }
    }
    return this.getTideCloakClient().idTokenParsed[key] ?? null;
  }

  /**
   * Refreshes token if expired or about to expire.
   * @returns {Promise<boolean>}
   * @throws {Error} In hybrid mode (token refresh handled server-side)
   */
  async updateIAMToken() {
    if (this.isHybridMode()) {
      throw new Error("updateIAMToken() not available in hybrid mode - tokens are server-side");
    }
    if (this.isNativeMode()) {
      // Native mode token refresh is handled in getToken()
      // Just check if tokens need refresh and return status
      const exp = this.getTokenExp();
      if (exp < 30) {
        // Force refresh via getToken
        await this.getToken();
      }
      return exp < 30;
    }
    const kc = this.getTideCloakClient();
    const refreshed = await kc.updateToken();
    const expiresIn = this.getTokenExp();
    console.debug(
      refreshed
        ? `[updateIAMToken] Refreshed: ${expiresIn}s`
        : `[updateIAMToken] Still valid: ${expiresIn}s`
    );
    document.cookie = `kcToken=${kc.token}; path=/;`;
    return refreshed;
  }

  /**
   * Force immediate refresh (min validity = -1).
   * @returns {Promise<boolean>}
   * @throws {Error} In hybrid mode (token refresh handled server-side)
   */
  async forceUpdateToken() {
    if (this.isHybridMode()) {
      throw new Error("forceUpdateToken() not available in hybrid mode - tokens are server-side");
    }
    if (this.isNativeMode()) {
      // Force refresh by clearing cached tokens and refreshing
      if (this._nativeTokens?.refreshToken) {
        try {
          const newTokens = await this._refreshNativeToken(this._nativeTokens.refreshToken);
          this._nativeTokens = newTokens;
          await this._nativeAdapter.saveTokens(newTokens);
          return true;
        } catch (err) {
          console.error("[IAMService] Native force refresh failed:", err);
          return false;
        }
      }
      return false;
    }
    document.cookie = 'kcToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    const kc = this.getTideCloakClient();
    const refreshed = await kc.updateToken(-1);
    const expiresIn = this.getTokenExp();
    console.debug(
      refreshed
        ? `[updateToken] Immediately refreshed: ${expiresIn}s`
        : `[updateToken] No refresh needed: ${expiresIn}s`
    );
    document.cookie = `kcToken=${kc.token}; path=/;`;
    return refreshed;
  }

  /**
   * Start login redirect.
   * In hybrid mode, initiates PKCE flow and redirects to IdP.
   * In native mode, opens external browser with auth URL.
   * @param {string} [returnUrl] - URL to redirect to after successful auth (hybrid/native mode)
   */
  doLogin(returnUrl = "") {
    console.debug("[IAMService.doLogin] Called with returnUrl:", returnUrl);
    console.debug("[IAMService.doLogin] isHybridMode:", this.isHybridMode());
    console.debug("[IAMService.doLogin] isNativeMode:", this.isNativeMode());
    console.debug("[IAMService.doLogin] authMode config:", this._config?.authMode);
    if (this.isHybridMode()) {
      // Catch and log any errors from the async function
      return this._startHybridLogin(returnUrl).catch(err => {
        console.error("[IAMService.doLogin] Error in hybrid login:", err);
        throw err;
      });
    }
    if (this.isNativeMode()) {
      return this._startNativeLogin(returnUrl).catch(err => {
        console.error("[IAMService.doLogin] Error in native login:", err);
        throw err;
      });
    }
    this.getTideCloakClient().login({
      redirectUri: this._config["redirectUri"] ?? `${window.location.origin}/auth/redirect`
    });
  }

  /**
   * Encrypt data via adapter.
   * Not available in hybrid mode (encryption requires client-side doken).
   * @param {{ data: string | Uint8Array, tags: string[] }[]} data - Array of objects to encrypt
   * @returns {Promise<(string | Uint8Array)[]>} Array of encrypted values
   */
  async doEncrypt(data) {
    if (this.isHybridMode()) {
      throw new Error("Encrypt not supported in hybrid mode (tokens are server-side)");
    }
    if (this.isNativeMode()) {
      return this._nativeEncrypt(data);
    }
    return this.getTideCloakClient().encrypt(data);
  }

  /**
   * Decrypt data via adapter.
   * Not available in hybrid mode (decryption requires client-side doken).
   * @param {{ encrypted: string | Uint8Array, tags: string[] }[]} data - Array of objects to decrypt
   * @returns {Promise<(string | Uint8Array)[]>} Array of decrypted values
   */
  async doDecrypt(data) {
    if (this.isHybridMode()) {
      throw new Error("Decrypt not supported in hybrid mode (tokens are server-side)");
    }
    if (this.isNativeMode()) {
      return this._nativeDecrypt(data);
    }
    return this.getTideCloakClient().decrypt(data);
  }

  /**
   * Drop-in replacement for fetch that automatically handles DPoP authentication.
   * If the request includes a Bearer token matching the TideCloak-managed token,
   * it's replaced with DPoP authorization and proof. Also manages resource server
   * nonces automatically. Otherwise, behaves like regular fetch.
   *
   * @param {string|URL|RequestInfo} url - The resource URL to fetch
   * @param {RequestInit} [init] - Optional fetch init options (same as standard fetch)
   * @returns {Promise<Response>} A promise that resolves to the fetch Response
   * @throws {Error} In hybrid mode (tokens are server-side)
   *
   * @example
   * ```js
   * const token = await IAMService.getToken();
   * const response = await IAMService.secureFetch('https://api.example.com/data', {
   *   method: 'POST',
   *   headers: {
   *     'Authorization': `Bearer ${token}`,
   *     'Content-Type': 'application/json',
   *   },
   *   body: JSON.stringify({ key: 'value' }),
   * });
   * ```
   */
  async secureFetch(url, init) {
    if (this.isHybridMode()) {
      throw new Error("secureFetch() not available in hybrid mode - tokens are server-side");
    }
    if (this.isNativeMode()) {
      return this._nativeSecureFetch(url, init);
    }
    return this.getTideCloakClient().secureFetch(url, init);
  }

  /**
   * Native mode secure fetch with DPoP support.
   * @private
   */
  async _nativeSecureFetch(url, init = {}) {
    if (!this._dpopProvider) {
      // No DPoP configured, fall through to regular fetch
      return fetch(url, init);
    }

    const token = await this.getToken();
    if (!token) {
      return fetch(url, init);
    }

    const urlStr = typeof url === "string" ? url : url.toString();
    const method = (init.method || "GET").toUpperCase();
    const origin = new URL(urlStr).origin;

    // Check if the Authorization header contains the managed token
    const headers = new Headers(init.headers || {});
    const authHeader = headers.get("Authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (!bearerToken || bearerToken !== token) {
      // Not our managed token, use regular fetch
      return fetch(url, init);
    }

    // Generate DPoP proof and replace Bearer with DPoP scheme
    const nonce = this._dpopProvider.getResourceServerNonce(origin);
    const proof = await this._dpopProvider.generateDPoPProof(urlStr, method, token, nonce);

    headers.set("Authorization", `DPoP ${token}`);
    headers.set("DPoP", proof);

    let response = await fetch(url, { ...init, headers });

    // Handle DPoP-Nonce from response
    const dpopNonce = response.headers.get("DPoP-Nonce");
    if (dpopNonce) {
      this._dpopProvider.updateResourceServerNonce(origin, dpopNonce);
    }

    // Retry on 401 with use_dpop_nonce
    if (response.status === 401 && dpopNonce) {
      const retryProof = await this._dpopProvider.generateDPoPProof(urlStr, method, token, dpopNonce);
      headers.set("DPoP", retryProof);
      response = await fetch(url, { ...init, headers });

      const retryNonce = response.headers.get("DPoP-Nonce");
      if (retryNonce) {
        this._dpopProvider.updateResourceServerNonce(origin, retryNonce);
      }
    }

    return response;
  }

  /**
   * Logout, clear cookie/session, then redirect.
   * In hybrid mode, clears local state and emits logout event.
   * In native mode, deletes tokens via adapter and emits logout event.
   */
  async doLogout() {
    if (this.isHybridMode()) {
      this._hybridAuthenticated = false;
      this._hybridReturnUrl = null;
      this._emit("logout");
      return;
    }
    if (this.isNativeMode()) {
      await this._nativeAdapter.deleteTokens();
      this._nativeTokens = null;
      this._nativeAuthenticated = false;
      this._nativeDoken = null;
      this._nativeDokenParsed = null;
      this._nativeVoucher = null;
      // Reset callback flags so next login reinitializes properly
      this._nativeCallbackHandled = false;
      this._nativeCallbackProcessing = false;
      this._nativeCallbackPromise = null;
      // Unsubscribe from callbacks (will be resubscribed on next init)
      if (this._nativeCallbackUnsubscribe) {
        this._nativeCallbackUnsubscribe();
        this._nativeCallbackUnsubscribe = null;
      }
      if (this._nativeEncryptionCallbackUnsubscribe) {
        this._nativeEncryptionCallbackUnsubscribe();
        this._nativeEncryptionCallbackUnsubscribe = null;
      }
      // Close and cleanup the request enclave
      if (this._nativeRequestEnclave) {
        try {
          this._nativeRequestEnclave.close();
        } catch (e) {
          console.debug("[IAMService] Error closing request enclave:", e);
        }
        this._nativeRequestEnclave = null;
      }
      this._emit("logout");
      return;
    }
    document.cookie = 'kcToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    this.getTideCloakClient().logout({
      redirectUri: this._config["redirectUri"] ?? `${window.location.origin}/auth/redirect`
    });
  }

  /**
   * Base URL for Tidecloak realm (no trailing slash).
   * In hybrid mode returns empty string.
   */
  getBaseUrl() {
    if (this.isHybridMode()) return "";
    return this._config?.["auth-server-url"]?.replace(/\/$/, "") || "";
  }

  // ---------------------------------------------------------------------------
  // HYBRID MODE SUPPORT (private helpers)
  // ---------------------------------------------------------------------------

  /**
   * Start hybrid login flow: generate PKCE, store verifier, redirect to IdP.
   * @private
   * @param {string} returnUrl - URL to redirect to after successful auth
   */
  async _startHybridLogin(returnUrl = "") {
    if (typeof window === "undefined") {
      throw new Error("Cannot login in SSR context");
    }

    const oidc = this._config?.oidc;
    const tokenExchange = this._config?.tokenExchange;

    console.debug("[IAMService._startHybridLogin] Config:", {
      authorizationEndpoint: oidc?.authorizationEndpoint,
      clientId: oidc?.clientId,
      redirectUri: oidc?.redirectUri,
      tokenExchangeEndpoint: tokenExchange?.endpoint,
    });

    if (!oidc?.authorizationEndpoint || !oidc?.clientId || !oidc?.redirectUri) {
      throw new Error("Hybrid mode requires config.oidc.authorizationEndpoint, clientId, and redirectUri");
    }
    if (!tokenExchange?.endpoint) {
      throw new Error("Hybrid mode requires config.tokenExchange.endpoint");
    }

    console.debug("[IAMService] Generating PKCE...");
    const { verifier, challenge, method } = await makePkce();
    console.debug("[IAMService] PKCE generated, verifier length:", verifier.length);

    // Store PKCE verifier and return URL in sessionStorage
    sessionStorage.setItem("kc_pkce_verifier", verifier);
    sessionStorage.setItem("kc_return_url", returnUrl || "");

    // Verify storage worked
    const storedVerifier = sessionStorage.getItem("kc_pkce_verifier");
    console.debug("[IAMService] Stored verifier in sessionStorage, retrieved length:", storedVerifier?.length);

    // Encode return URL in state parameter
    const state = returnUrl ? `__url_${returnUrl}` : "";
    const scope = oidc.scope || "openid profile email";

    const authUrl =
      `${oidc.authorizationEndpoint}` +
      `?client_id=${encodeURIComponent(oidc.clientId)}` +
      `&redirect_uri=${encodeURIComponent(oidc.redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      `&code_challenge=${encodeURIComponent(challenge)}` +
      `&code_challenge_method=${encodeURIComponent(method)}` +
      (oidc.prompt ? `&prompt=${encodeURIComponent(oidc.prompt)}` : "");

    console.debug("[IAMService] Redirecting to:", authUrl.substring(0, 100) + "...");
    window.location.assign(authUrl);
  }

  /**
   * Get hybrid callback data for custom token exchange.
   * Use this when you need to handle token exchange with your own auth system
   * (e.g., using a custom useLogin hook) instead of IAMService's built-in fetchJson.
   *
   * @param {Object} [opts] - Options
   * @param {boolean} [opts.clearStorage=true] - Whether to clear sessionStorage after reading
   * @param {string} [opts.redirectUri] - Override redirect URI (use when config isn't loaded)
   * @param {string} [opts.provider] - Override provider (defaults to "tidecloak-auth")
   * @returns {{
   *   isCallback: boolean,
   *   code: string,
   *   verifier: string,
   *   redirectUri: string,
   *   returnUrl: string,
   *   provider: string,
   *   error: string|null,
   *   errorDescription: string|null
   * }}
   *
   * @example
   * // With redirectUri override (recommended for callback pages after full navigation)
   * const data = IAMService.getHybridCallbackData({
   *   redirectUri: process.env.KEYCLOAK_REDIRECTURI,
   * });
   * if (data.isCallback && data.code && data.verifier) {
   *   login.execute({
   *     accessToken: JSON.stringify({
   *       code: data.code,
   *       code_verifier: data.verifier,
   *       redirect_uri: data.redirectUri,
   *     }),
   *     provider: data.provider,
   *   });
   * }
   */
  getHybridCallbackData(opts = {}) {
    const { clearStorage = true, redirectUri: optsRedirectUri, provider: optsProvider } = opts;

    if (typeof window === "undefined") {
      return {
        isCallback: false,
        code: "",
        verifier: "",
        redirectUri: "",
        returnUrl: "",
        provider: "",
        error: null,
        errorDescription: null,
      };
    }

    // Return cached data if available (prevents data loss from multiple calls or initIAM clearing storage)
    if (this._cachedCallbackData) {
      console.debug("[IAMService.getHybridCallbackData] Returning cached data");
      // Allow overriding redirectUri and provider even when returning cached data
      return {
        ...this._cachedCallbackData,
        redirectUri: optsRedirectUri || this._cachedCallbackData.redirectUri,
        provider: optsProvider || this._cachedCallbackData.provider,
      };
    }

    const qs = new URLSearchParams(window.location.search);
    const error = qs.get("error");
    const errorDescription = qs.get("error_description");
    const code = qs.get("code") || "";
    const state = qs.get("state") || "";

    // Decode return URL from state, fallback to sessionStorage
    const stateReturnUrl = state.startsWith("__url_") ? state.substring(6) : "";
    const returnUrl = stateReturnUrl || sessionStorage.getItem("kc_return_url") || "";

    const verifier = sessionStorage.getItem("kc_pkce_verifier") || "";
    // Use opts override, then config, then empty string
    const redirectUri = optsRedirectUri || this._config?.oidc?.redirectUri || "";
    const provider = optsProvider || this._config?.tokenExchange?.provider || "tidecloak-auth";

    const isCallback = !!(code || error);

    console.debug("[IAMService.getHybridCallbackData] code:", code ? code.substring(0, 20) + "..." : "(empty)");
    console.debug("[IAMService.getHybridCallbackData] verifier:", verifier ? `(length: ${verifier.length})` : "(empty)");
    console.debug("[IAMService.getHybridCallbackData] redirectUri:", redirectUri);
    console.debug("[IAMService.getHybridCallbackData] returnUrl:", returnUrl);
    console.debug("[IAMService.getHybridCallbackData] clearStorage:", clearStorage, "isCallback:", isCallback);

    const data = {
      isCallback,
      code,
      verifier,
      redirectUri,
      returnUrl,
      provider,
      error,
      errorDescription,
    };

    // Cache the data before clearing storage
    if (isCallback && verifier) {
      this._cachedCallbackData = data;
      console.debug("[IAMService.getHybridCallbackData] Cached callback data");
    }

    if (clearStorage && isCallback) {
      sessionStorage.removeItem("kc_pkce_verifier");
      sessionStorage.removeItem("kc_return_url");
      console.debug("[IAMService.getHybridCallbackData] Cleared sessionStorage");
    }

    return data;
  }

  /**
   * Handle hybrid redirect callback: exchange code for tokens via backend endpoint.
   * @private
   * @param {Object} opts - Options
   * @param {string} [opts.onMissingVerifierRedirectTo] - URL to redirect if verifier is missing
   * @returns {Promise<{handled: boolean, authenticated: boolean, returnUrl: string}>}
   */
  async _handleHybridRedirectCallback(opts = {}) {
    if (typeof window === "undefined") {
      return { handled: false, authenticated: false, returnUrl: "" };
    }

    const qs = new URLSearchParams(window.location.search);
    const error = qs.get("error");
    const errorDescription = qs.get("error_description") || "An error occurred";
    const code = qs.get("code") || "";
    const state = qs.get("state") || "";

    // Decode return URL from state, fallback to sessionStorage (Keycloak broker modifies state)
    const stateReturnUrl = state.startsWith("__url_") ? state.substring(6) : "";
    const returnUrl = stateReturnUrl || sessionStorage.getItem("kc_return_url") || "";

    // Handle error response from IdP
    if (error) {
      this._emit("authError", new Error(`${error}: ${errorDescription}`));
      this._emit("ready", false);
      return { handled: true, authenticated: false, returnUrl };
    }

    // No code = not a callback page
    if (!code) {
      console.debug("[IAMService] No code in URL, not a callback page");
      return { handled: false, authenticated: false, returnUrl: "" };
    }

    console.debug("[IAMService] Code found in URL, checking for PKCE verifier...");
    const verifier = sessionStorage.getItem("kc_pkce_verifier") || "";
    const redirectUri = this._config?.oidc?.redirectUri || "";
    console.debug("[IAMService] Retrieved verifier from sessionStorage, length:", verifier.length);
    console.debug("[IAMService] Current origin:", window.location.origin);

    // Cache the callback data so getHybridCallbackData() can access it even after we clear storage
    if (code && verifier) {
      const provider = this._config?.tokenExchange?.provider || "tidecloak-auth";
      this._cachedCallbackData = {
        isCallback: true,
        code,
        verifier,
        redirectUri,
        returnUrl,
        provider,
        error: null,
        errorDescription: null,
      };
      console.debug("[IAMService] Cached callback data from _handleHybridRedirectCallback");
    }

    // Code present but verifier missing (e.g., page refresh after verifier consumed)
    if (code.length > 0 && verifier.length === 0) {
      console.error("[IAMService] PKCE verifier missing! Code present but no verifier in sessionStorage.");
      console.debug("[IAMService] All sessionStorage keys:", Object.keys(sessionStorage));
      if (opts.onMissingVerifierRedirectTo) {
        window.location.assign(opts.onMissingVerifierRedirectTo);
      }
      this._emit("authError", new Error("Missing PKCE verifier (likely page refresh after it was consumed)"));
      this._emit("ready", false);
      return { handled: true, authenticated: false, returnUrl };
    }

    // Clear session storage
    sessionStorage.removeItem("kc_pkce_verifier");
    sessionStorage.removeItem("kc_return_url");

    const tokenExchange = this._config?.tokenExchange;
    const exchangeEndpoint = tokenExchange?.endpoint;
    const provider = tokenExchange?.provider || "tidecloak-auth";

    // Support custom headers (static object or dynamic function)
    const customHeaders = typeof tokenExchange?.headers === "function"
      ? tokenExchange.headers()
      : (tokenExchange?.headers || {});

    console.debug("[IAMService] Token exchange endpoint:", exchangeEndpoint);
    console.debug("[IAMService] Custom headers:", customHeaders);

    try {
      // Exchange code for tokens via backend endpoint
      // Payload format matches existing backend expectation
      await fetchJson(exchangeEndpoint, {
        method: "POST",
        headers: customHeaders,
        body: JSON.stringify({
          accessToken: JSON.stringify({
            code: code,
            code_verifier: verifier,
            redirect_uri: redirectUri,
          }),
          provider,
        }),
      });

      this._hybridAuthenticated = true;
      this._hybridReturnUrl = returnUrl || null;  // Set BEFORE emitting so getReturnUrl() works in handler
      this._emit("authSuccess");

      // Clean URL (remove code, state, etc.)
      const url = new URL(window.location.href);
      ["code", "state", "session_state", "iss", "error", "error_description"].forEach(k =>
        url.searchParams.delete(k)
      );
      window.history.replaceState({}, document.title, url.toString());

      this._emit("ready", true);
      return { handled: true, authenticated: true, returnUrl };
    } catch (err) {
      this._hybridAuthenticated = false;
      this._emit("authError", err);
      this._emit("ready", false);
      return { handled: true, authenticated: false, returnUrl };
    }
  }

  // ---------------------------------------------------------------------------
  // NATIVE MODE SUPPORT (private helpers)
  // ---------------------------------------------------------------------------

  /**
   * Get OIDC configuration from the native config.
   * @private
   * @returns {{ authServerUrl: string, realm: string, clientId: string, scope: string }}
   */
  _getNativeOIDCConfig() {
    const config = this._config;
    return {
      authServerUrl: config["auth-server-url"],
      realm: config.realm,
      clientId: config.resource,
      scope: config.scope || "openid profile email",
    };
  }

  /**
   * Get encryption configuration from the native config.
   * Automatically selects clientOriginAuth based on window.location.origin.
   * @private
   * @returns {{ vendorId: string, homeOrkUrl: string, clientOriginAuth: string } | null}
   */
  _getNativeEncryptionConfig() {
    const config = this._config;
    if (!config.vendorId) {
      return null;
    }

    // Auto-select clientOriginAuth based on current origin
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const clientOriginAuthKey = `client-origin-auth-${origin}`;
    const clientOriginAuth = config[clientOriginAuthKey];

    return {
      vendorId: config.vendorId,
      homeOrkUrl: config.homeOrkUrl,
      clientOriginAuth,
    };
  }

  /**
   * Start native login flow: generate PKCE, open external browser with auth URL.
   * @private
   * @param {string} returnUrl - URL to redirect to after successful auth
   */
  async _startNativeLogin(returnUrl = "") {
    console.debug("[IAMService._startNativeLogin] Starting native login flow");

    // Reset auth state to allow new callback to be processed
    // This is needed for re-login after session expiry
    this._nativeAuthenticated = false;
    this._nativeCallbackProcessing = false;

    const adapter = this._nativeAdapter;
    if (!adapter) {
      throw new Error("Native adapter not configured");
    }

    // Get OIDC config from the main config
    const { authServerUrl, realm, clientId, scope } = this._getNativeOIDCConfig();

    // Generate PKCE
    const { verifier, challenge, method } = await makePkce();
    console.debug("[IAMService._startNativeLogin] PKCE generated, verifier length:", verifier.length);

    // Store PKCE verifier in sessionStorage (will be retrieved when callback is received)
    sessionStorage.setItem("kc_pkce_verifier", verifier);
    if (returnUrl) {
      sessionStorage.setItem("kc_return_url", returnUrl);
    }

    // Get redirect URI from adapter (can be async)
    const redirectUri = await Promise.resolve(adapter.getRedirectUri());
    sessionStorage.setItem("kc_redirect_uri", redirectUri);

    // Build auth URL
    const authUrl =
      `${authServerUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/auth` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&code_challenge=${encodeURIComponent(challenge)}` +
      `&code_challenge_method=${encodeURIComponent(method)}` +
      `&prompt=login`;

    console.debug("[IAMService._startNativeLogin] Opening auth URL in external browser");

    // Open in external browser via adapter
    await adapter.openExternalUrl(authUrl);
  }

  /**
   * Handle native auth callback: exchange code for tokens.
   * @private
   * @param {string} code - Authorization code from IdP
   * @param {string} [voucher] - Optional voucher fetched during login (for encryption)
   */
  async _handleNativeCallback(code, voucher) {
    // Guard against concurrent/duplicate callback processing
    if (this._nativeCallbackProcessing) {
      console.debug("[IAMService._handleNativeCallback] Already processing callback, ignoring duplicate");
      return;
    }
    this._nativeCallbackProcessing = true;
    this._nativeCallbackHandled = true;

    console.debug("[IAMService._handleNativeCallback] Handling native callback with code");

    const adapter = this._nativeAdapter;
    const { authServerUrl, realm, clientId } = this._getNativeOIDCConfig();

    // Retrieve PKCE verifier
    const verifier = sessionStorage.getItem("kc_pkce_verifier");
    const redirectUri = sessionStorage.getItem("kc_redirect_uri") || await Promise.resolve(adapter.getRedirectUri());
    const returnUrl = sessionStorage.getItem("kc_return_url") || "";

    // Clear session storage immediately to prevent reuse
    sessionStorage.removeItem("kc_pkce_verifier");
    sessionStorage.removeItem("kc_redirect_uri");
    sessionStorage.removeItem("kc_return_url");

    if (!verifier) {
      console.debug("[IAMService._handleNativeCallback] PKCE verifier not found, callback already processed");
      this._nativeCallbackProcessing = false;
      // Don't emit error - this is likely a duplicate callback after successful auth
      return;
    }

    try {
      // Exchange code for tokens at token endpoint
      const tokenUrl = `${authServerUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`;

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code: code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });

      // Build headers, including DPoP proof if enabled
      const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
      };

      if (this._dpopProvider) {
        const nonce = await this._dpopProvider.getAuthServerNonce();
        headers['DPoP'] = await this._dpopProvider.generateDPoPProof(tokenUrl, 'POST', undefined, nonce);
      }

      let response = await fetch(tokenUrl, {
        method: "POST",
        headers,
        body: body.toString(),
      });

      // Handle DPoP nonce retry: server may respond with use_dpop_nonce error
      if (!response.ok && this._dpopProvider) {
        const dpopNonce = response.headers.get('DPoP-Nonce');
        if (dpopNonce) {
          await this._dpopProvider.updateAuthServerNonce(dpopNonce);
          headers['DPoP'] = await this._dpopProvider.generateDPoPProof(tokenUrl, 'POST', undefined, dpopNonce);
          response = await fetch(tokenUrl, {
            method: "POST",
            headers,
            body: body.toString(),
          });
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const data = await response.json();
      console.debug("[IAMService._handleNativeCallback] Token exchange successful");

      // Note: Voucher is NOT fetched here - the RequestEnclave will fetch it
      // via its ORK iframe when encryption/decryption is needed. This avoids
      // the complexity of session cookie handling during login.

      // Build token object for storage
      const tokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        idToken: data.id_token,
        doken: data.doken, // Tide doken for encryption/decryption
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      // Save tokens via adapter
      await adapter.saveTokens(tokens);
      this._nativeTokens = tokens;
      this._nativeDoken = data.doken;
      this._nativeDokenParsed = data.doken ? this._parseToken(data.doken) : null;
      // Note: _nativeVoucher is NOT set here - RequestEnclave fetches it on-demand
      this._nativeAuthenticated = true;
      this._nativeCallbackProcessing = false;

      this._emit("authSuccess");
      console.debug("[IAMService._handleNativeCallback] Native auth complete, returnUrl:", returnUrl);

    } catch (err) {
      console.error("[IAMService._handleNativeCallback] Token exchange error:", err);
      this._nativeAuthenticated = false;
      this._nativeCallbackProcessing = false;
      this._emit("authError", err);
    }
  }

  /**
   * Refresh native token using refresh token.
   * @private
   * @param {string} refreshToken - The refresh token
   * @returns {Promise<Object>} New token data
   */
  async _refreshNativeToken(refreshToken) {
    const { authServerUrl, realm, clientId } = this._getNativeOIDCConfig();

    const tokenUrl = `${authServerUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`;

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${errorText}`);
    }

    const data = await response.json();

    // Update doken if present in refresh response
    if (data.doken) {
      this._nativeDoken = data.doken;
      this._nativeDokenParsed = this._parseToken(data.doken);
      console.debug("[IAMService] Updated doken from token refresh");
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      doken: data.doken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  // ---------------------------------------------------------------------------
  // NATIVE MODE ENCRYPTION SUPPORT (private helpers)
  // ---------------------------------------------------------------------------

  /**
   * Initialize the native RequestEnclave for encryption/decryption.
   * @private
   * @param {string} voucherDataUrl - Pre-fetched voucher as data URL
   */
  _initNativeRequestEnclave(voucherDataUrl) {
    if (!this._nativeDoken) {
      throw new Error("[IAMService] No doken available for encryption - user must be authenticated with Tide");
    }
    if (!this._nativeDokenParsed) {
      throw new Error("[IAMService] Doken not parsed");
    }

    // Get encryption config from the main config (auto-selects clientOriginAuth based on origin)
    const encryptionConfig = this._getNativeEncryptionConfig();
    if (!encryptionConfig || !encryptionConfig.vendorId || !encryptionConfig.clientOriginAuth) {
      throw new Error("[IAMService] Native encryption requires vendorId and client-origin-auth-{origin} in config");
    }

    // Reuse existing enclave if already initialized
    if (this._nativeRequestEnclave) {
      console.debug("[IAMService] Reusing existing RequestEnclave");
      return;
    }

    const homeOrkOrigin = this._nativeDokenParsed['t.uho'] || encryptionConfig.homeOrkUrl;

    if (!homeOrkOrigin) {
      throw new Error("[IAMService] Home ORK URL not available - check doken or config.homeOrkUrl");
    }

    console.debug("[IAMService] Initializing native RequestEnclave", {
      homeOrkOrigin,
      vendorId: encryptionConfig.vendorId,
      voucherURL: voucherDataUrl,
    });

    this._nativeRequestEnclave = new RequestEnclave({
      homeOrkOrigin,
      signed_client_origin: encryptionConfig.clientOriginAuth,
      vendorId: encryptionConfig.vendorId,
      voucherURL: voucherDataUrl,
      isRunningLocal: false,
    }).init({
      doken: this._nativeDoken,
      dokenRefreshCallback: async () => {
        // Refresh tokens and return the new doken
        await this.forceUpdateToken();
        if (!this._nativeDoken) {
          throw new Error("[IAMService] No doken available after token refresh");
        }
        return this._nativeDoken;
      },
      requireReloginCallback: async () => {
        // User needs to re-authenticate
        console.warn("[IAMService] Re-authentication required for encryption");
        this._emit("authError", new Error("Re-authentication required"));
      },
    });
  }

  /**
   * Build the encryption page URL for external browser.
   * This page is hosted on the TideCloak server and has session cookies.
   * @private
   * @param {string} operation - 'encrypt' or 'decrypt'
   * @param {string} requestId - Unique request ID
   * @param {string} dataBase64 - Base64-encoded data to process
   * @param {string} tagsJson - JSON-encoded tags array
   * @param {string} callbackUrl - URL to redirect with result
   * @returns {string} URL to open in external browser
   */
  _buildEncryptionPageUrl(operation, requestId, dataBase64, tagsJson, callbackUrl) {
    const { authServerUrl, realm, clientId } = this._getNativeOIDCConfig();
    const encryptionConfig = this._getNativeEncryptionConfig();

    // Build URL to a page on the TideCloak server that can perform encryption
    // This page will have access to session cookies
    const baseUrl = `${authServerUrl}/realms/${encodeURIComponent(realm)}/tide-encrypt`;

    const url = new URL(baseUrl);
    url.searchParams.set('operation', operation);
    url.searchParams.set('requestId', requestId);
    url.searchParams.set('data', dataBase64);
    url.searchParams.set('tags', tagsJson);
    url.searchParams.set('callback', callbackUrl);
    url.searchParams.set('vendorId', encryptionConfig?.vendorId || '');
    url.searchParams.set('clientId', clientId);

    return url.toString();
  }

  /**
   * Perform an encryption operation via external browser.
   * @private
   * @param {'encrypt' | 'decrypt'} operation - The operation to perform
   * @param {string} dataBase64 - Base64-encoded data to process
   * @param {string[]} tags - Tags for the operation
   * @returns {Promise<string>} Base64-encoded result
   */
  async _doExternalBrowserOperation(operation, dataBase64, tags) {
    const adapter = this._nativeAdapter;

    // Generate unique request ID
    const requestId = `${operation}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Get callback URL for encryption operations
    let callbackUrl;
    if (adapter.getEncryptionRedirectUri) {
      callbackUrl = await Promise.resolve(adapter.getEncryptionRedirectUri());
    } else {
      // Default: use auth redirect URI with /encrypt/callback suffix
      const authRedirectUri = await Promise.resolve(adapter.getRedirectUri());
      // Replace /callback with /encrypt/callback, or append if no /callback
      if (authRedirectUri.endsWith('/callback')) {
        callbackUrl = authRedirectUri.replace('/callback', '/encrypt/callback');
      } else {
        callbackUrl = authRedirectUri + '/encrypt/callback';
      }
    }

    // Build the URL
    const tagsJson = JSON.stringify(tags);
    const encryptionUrl = this._buildEncryptionPageUrl(operation, requestId, dataBase64, tagsJson, callbackUrl);

    console.debug(`[IAMService] Opening external browser for ${operation}:`, {
      requestId,
      callbackUrl,
      urlLength: encryptionUrl.length,
    });

    // Create a promise that will resolve when we get the callback
    const resultPromise = new Promise((resolve, reject) => {
      // Store the pending request
      this._pendingEncryptionRequests.set(requestId, { resolve, reject });

      // Set a timeout (60 seconds)
      const timeout = setTimeout(() => {
        if (this._pendingEncryptionRequests.has(requestId)) {
          this._pendingEncryptionRequests.delete(requestId);
          reject(new Error(`Encryption ${operation} timed out after 60 seconds`));
        }
      }, 60000);

      // Update the stored request to include timeout cleanup
      const pending = this._pendingEncryptionRequests.get(requestId);
      const originalResolve = pending.resolve;
      const originalReject = pending.reject;
      pending.resolve = (result) => {
        clearTimeout(timeout);
        originalResolve(result);
      };
      pending.reject = (error) => {
        clearTimeout(timeout);
        originalReject(error);
      };
    });

    // Open the URL in external browser
    await adapter.openExternalUrl(encryptionUrl);

    // Wait for the callback
    return resultPromise;
  }

  /**
   * Get the voucher URL for native mode.
   * @private
   * @returns {string} Voucher URL
   */
  _getNativeVoucherUrl() {
    if (!this._nativeTokens?.accessToken) {
      throw new Error("[IAMService] No access token available for voucher URL");
    }

    const tokenPayload = this._parseToken(this._nativeTokens.accessToken);
    if (!tokenPayload) {
      throw new Error("[IAMService] Failed to parse access token for voucher URL");
    }

    const sid = tokenPayload.sid;
    if (!sid) {
      throw new Error("[IAMService] No session ID in access token for voucher URL");
    }

    const { authServerUrl, realm } = this._getNativeOIDCConfig();
    return `${authServerUrl}/realms/${encodeURIComponent(realm)}/tidevouchers/fromUserSession?sessionId=${encodeURIComponent(sid)}`;
  }


  /**
   * Check if user has a realm role (native mode helper).
   * @private
   * @param {string} role - Role to check
   * @returns {boolean}
   */
  _nativeHasRealmRole(role) {
    if (!this._nativeTokens?.accessToken) return false;
    try {
      const payload = this._parseToken(this._nativeTokens.accessToken);
      const realmRoles = payload?.realm_access?.roles || [];
      return realmRoles.includes(role);
    } catch (e) {
      return false;
    }
  }

  /**
   * Native mode encryption using RequestEnclave.
   * Uses either a pre-fetched voucher (as data URL) or the live voucherURL
   * that the ORK iframe will fetch with session cookies.
   * @private
   * @param {{ data: string | Uint8Array, tags: string[] }[]} toEncrypt
   * @returns {Promise<(string | Uint8Array)[]>}
   */
  async _nativeEncrypt(toEncrypt) {
    // Ensure token is fresh
    await this.updateIAMToken();

    if (!Array.isArray(toEncrypt)) {
      throw new Error("Pass array as parameter");
    }
    if (!this._nativeAuthenticated) {
      throw new Error("Not authenticated");
    }

    // Convert and validate input
    const dataToSend = toEncrypt.map((e) => {
      if (typeof e !== 'object' || e === null) {
        throw new Error("All entries must be an object to encrypt");
      }
      for (const property of ['data', 'tags']) {
        if (!e[property]) {
          throw new Error(`The object is missing the required '${property}' property.`);
        }
      }
      if (!Array.isArray(e.tags)) {
        throw new Error("tags must be provided as a string array");
      }
      if (typeof e.data !== 'string' && !(e.data instanceof Uint8Array)) {
        throw new Error("data must be provided as string or Uint8Array");
      }

      // Check roles
      for (const tag of e.tags) {
        if (typeof tag !== 'string') {
          throw new Error("tags must be provided as an array of strings");
        }
        const tagAccess = this._nativeHasRealmRole(`_tide_${tag}.selfencrypt`);
        if (!tagAccess) {
          throw new Error(`User has not been given any access to '${tag}'`);
        }
      }

      return {
        data: typeof e.data === 'string' ? this._stringToUint8Array(e.data) : e.data,
        tags: e.tags,
        isRaw: typeof e.data === 'string' ? false : true,
      };
    });

    // Get voucher URL - RequestEnclave will fetch it via ORK iframe
    const voucherUrl = this._getNativeVoucherUrl();
    console.debug("[IAMService._nativeEncrypt] Using voucherURL:", voucherUrl);

    this._initNativeRequestEnclave(voucherUrl);

    const encrypted = await this._nativeRequestEnclave.encrypt(dataToSend);
    return encrypted.map((cipher, i) => (dataToSend[i].isRaw ? cipher : this._bytesToBase64(cipher)));
  }

  /**
   * Native mode decryption using RequestEnclave.
   * Uses either a pre-fetched voucher (as data URL) or the live voucherURL
   * that the ORK iframe will fetch with session cookies.
   * @private
   * @param {{ encrypted: string | Uint8Array, tags: string[] }[]} toDecrypt
   * @returns {Promise<(string | Uint8Array)[]>}
   */
  async _nativeDecrypt(toDecrypt) {
    // Ensure token is fresh
    await this.updateIAMToken();

    if (!Array.isArray(toDecrypt)) {
      throw new Error("Pass array as parameter");
    }
    if (!this._nativeAuthenticated) {
      throw new Error("Not authenticated");
    }

    // Convert and validate input
    const dataToSend = toDecrypt.map((e) => {
      if (typeof e !== 'object' || e === null) {
        throw new Error("All entries must be an object to decrypt");
      }
      for (const property of ['encrypted', 'tags']) {
        if (!e[property]) {
          throw new Error(`The object is missing the required '${property}' property.`);
        }
      }
      if (!Array.isArray(e.tags)) {
        throw new Error("tags must be provided as a string array");
      }
      if (typeof e.encrypted !== 'string' && !(e.encrypted instanceof Uint8Array)) {
        throw new Error("encrypted must be provided as string or Uint8Array");
      }

      // Check roles
      for (const tag of e.tags) {
        if (typeof tag !== 'string') {
          throw new Error("tags must be provided as an array of strings");
        }
        const tagAccess = this._nativeHasRealmRole(`_tide_${tag}.selfdecrypt`);
        if (!tagAccess) {
          throw new Error(`User has not been given any access to '${tag}'`);
        }
      }

      return {
        encrypted: typeof e.encrypted === 'string' ? this._base64ToBytes(e.encrypted) : e.encrypted,
        tags: e.tags,
        isRaw: typeof e.encrypted === 'string' ? false : true,
      };
    });

    // Get voucher URL - RequestEnclave will fetch it via ORK iframe
    const voucherUrl = this._getNativeVoucherUrl();
    console.debug("[IAMService._nativeDecrypt] Using voucherURL:", voucherUrl);

    this._initNativeRequestEnclave(voucherUrl);

    const decrypted = await this._nativeRequestEnclave.decrypt(dataToSend);
    return decrypted.map((d, i) => (dataToSend[i].isRaw ? d : this._stringFromUint8Array(d)));
  }

  /**
   * Convert string to Uint8Array.
   * @private
   */
  _stringToUint8Array(str) {
    return new TextEncoder().encode(str);
  }

  /**
   * Convert Uint8Array to string.
   * @private
   */
  _stringFromUint8Array(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  /**
   * Convert bytes to base64.
   * @private
   */
  _bytesToBase64(bytes) {
    const binString = String.fromCodePoint(...bytes);
    return btoa(binString);
  }

  /**
   * Convert base64 to bytes.
   * @private
   */
  _base64ToBytes(base64) {
    const binString = atob(base64);
    const len = binString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binString.codePointAt(i);
    }
    return bytes;
  }

  /**
   * Parse a JWT token and return its payload.
   * @private
   * @param {string} token - JWT token string
   * @returns {Object|null} Parsed token payload or null on error
   */
  _parseToken(token) {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload;
    } catch (e) {
      console.error("[IAMService] Failed to parse token:", e);
      return null;
    }
  }

  /**
   * Cleanup native mode resources.
   */
  destroy() {
    if (this._nativeCallbackUnsubscribe) {
      this._nativeCallbackUnsubscribe();
      this._nativeCallbackUnsubscribe = null;
    }
    if (this._nativeEncryptionCallbackUnsubscribe) {
      this._nativeEncryptionCallbackUnsubscribe();
      this._nativeEncryptionCallbackUnsubscribe = null;
    }
    // Cleanup pending encryption requests
    for (const [requestId, pending] of this._pendingEncryptionRequests) {
      pending.reject(new Error("IAMService destroyed"));
    }
    this._pendingEncryptionRequests.clear();
    // Cleanup request enclave
    if (this._nativeRequestEnclave) {
      try {
        this._nativeRequestEnclave.close();
      } catch (e) {
        console.debug("[IAMService] Error closing request enclave:", e);
      }
      this._nativeRequestEnclave = null;
    }
  }

}

const IAMServiceInstance = new IAMService();
export { IAMServiceInstance as IAMService };
export default IAMServiceInstance;
