import TideCloak from "../lib/tidecloak";

/**
 * Singleton IAMService wrapping the TideCloak client.
 *
 * Usage A: pass an onReady callback directly
 * ```js
 * import { IAMService } from 'tidecloak-js';
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
 */
class IAMService {
  constructor() {
    this._tc = null;
    this._config = null;
    this._listeners = {};
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
   * Load TideCloak configuration and instantiate the client once.
   * @param {Object} config - TideCloak configuration object.
   * @returns {Promise<Object|null>} The loaded config, or null on failure.
   */
  async loadConfig(config) {
    if (this._tc) return this._config;

    if (!config || Object.keys(config).length === 0) {
      console.warn("[loadConfig] empty config");
      return null;
    }
    this._config = config;

    try {
      this._tc = new TideCloak({
        url: config["auth-server-url"],
        realm: config.realm,
        clientId: config.resource,
        vendorId: config.vendorId,
        homeOrkUrl: config.homeOrkUrl,
        clientOriginAuth: config['client-origin-auth-' + window.location.origin]
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
   * @param {Object} config - TideCloak configuration object.
   * @param {Function} [onReady] - Optional callback for the 'ready' event.
   * @returns {Promise<boolean>} true if authenticated, else false.
   */
  async initIAM(config, onReady) {
    console.debug("[IAMService] Initializing IAM...")
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

    if (!this._tc) {
      const err = new Error("TideCloak client not available");
      this._emit("initError", err);
      return false;
    }

    if (this._tc.didInitialize) {
      console.debug("[IAMService] IAM Already initialized once.")
      return this._tc.isLoggedIn();
    }

    let authenticated = false;
    try {
      authenticated = await this._tc.init({
        onLoad: "check-sso",
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
        pkceMethod: "S256",
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

  /** @returns {boolean} Whether there's a valid token */
  isLoggedIn() {
    return !!this.getTideCloakClient().token;
  }

  /** @returns {Promise<string>} Valid token (refreshing if needed) */
  async getToken() {
    const exp = this.getTokenExp();
    if (exp < 3) await this.updateIAMToken();
    return this.getTideCloakClient().token;
  }

  /** Seconds until token expiry */
  getTokenExp() {
    const kc = this.getTideCloakClient();
    return Math.round(kc.tokenParsed.exp + kc.timeSkew - Date.now() / 1000);
  }

  /** @returns {string} ID token */
  getIDToken() {
    return this.getTideCloakClient().idToken;
  }

  /** @returns {string} Username (preferred_username claim) */
  getName() {
    return this.getTideCloakClient().tokenParsed.preferred_username;
  }

  /**
   *  @param {string} role - the name of the role to check
   *  @returns {boolean} Whether the user has a given realm role */
  hasRealmRole(role) {
    return this.getTideCloakClient().hasRealmRole(role);
  }

  /**
   * @param {string} role - the name of the role to check
   * @param {string} [client] - optional client-ID (defaults to the configured adapter resource)
   * @returns {boolean} - whether the user has that role
   */
  hasClientRole(role, client) {
    return this.getTideCloakClient().hasResourceRole(role, client);
  }

  /** 
   * @param {string} key - The name of the claim to retrieve from the Access token's payload.
   * @returns {*} Custom claim from access token */
  getValueFromToken(key) {
    return this.getTideCloakClient().tokenParsed[key] ?? null;
  }

  /**
   * @param {string} key - The name of the claim to retrieve from the ID token's payload.
   * @returns {*} Custom claim from access token */
  getValueFromIDToken(key) {
    return this.getTideCloakClient().idTokenParsed[key] ?? null;
  }

  /** Refreshes token if expired or about to expire */
  async updateIAMToken() {
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

  /** Force immediate refresh (min validity = -1) */
  async forceUpdateToken() {
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

  /** Start login redirect */
  doLogin() {
    this.getTideCloakClient().login({
      redirectUri: this._config["redirectUri"] ?? `${window.location.origin}/auth/redirect`
    });
  }

  /** Encrypt data via adapter */
  async doEncrypt(data) {
    return this.getTideCloakClient().encrypt(data);
  }

  /** Decrypt data via adapter */
  async doDecrypt(data) {
    return this.getTideCloakClient().decrypt(data);
  }

  /** Logout, clear cookie, then redirect */
  doLogout() {
    document.cookie = 'kcToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    this.getTideCloakClient().logout({
      redirectUri: this._config["redirectUri"] ?? `${window.location.origin}/auth/redirect`
    });
  }

  /** Base URL for Tidecloak realm (no trailing slash) */
  getBaseUrl() {
    return this._config?.["auth-server-url"]?.replace(/\/$/, "") || "";
  }
}

const IAMServiceInstance = new IAMService();
export { IAMServiceInstance as IAMService };
export default IAMServiceInstance;
