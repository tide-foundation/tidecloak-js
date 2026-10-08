import TideCloak from "../lib/tidecloak.js";

class IAMServiceImplementation {
    /**
     * @type {TideCloak | null}
     */
    #core = null;
    #listeners = {};
    #initPromise = null;
    #tide = Object.freeze({
        encrypt: (toEncrypt, decryptionPolicy) => this.#getCore().encrypt(toEncrypt, decryptionPolicy),
        decrypt: (toDecrypt, decryptionPolicy) => this.#getCore().decrypt(toDecrypt, decryptionPolicy),
        draftEncryption: (toEncrypt) => this.#getCore().draftEncryption(toEncrypt),
        commitEncryption: (request, decryptionPolicy) => this.#getCore().commitEncryption(request, decryptionPolicy),
        draftDecryption: (toDecrypt) => this.#getCore().draftDecryption(toDecrypt),
        commitDecryption: (request, decryptionPolicy) => this.#getCore().commitDecryption(request, decryptionPolicy),
        createTideRequest: (encodedRequest) => this.#getCore().createTideRequest(encodedRequest),
        requestTideOperatorApproval: (requests) => this.#getCore().requestTideOperatorApproval(requests),
        executeSignRequest: (request, waitForAll) => this.#getCore().executeSignRequest(request, waitForAll),
    });
    get tide() {
        return this.#tide;
    }
    /**
     * Initialize from the TideCloak adapter config (tidecloak.json)
     * @param {Record<string, any>} json The contents of tidecloak.json
     * @param {import("../lib/tidecloak.js").TideCloakInitOptions | undefined} options Overrides the defaults
     *   (check-sso, S256 PKCE, request enclave on, dpopConfig / checkLoginIframe from tidecloak.json, and
     *   silentCheckSsoRedirectUri at `<origin>/silent-check-sso.html`). Apps that serve the silent SSO page
     *   elsewhere pass their own `silentCheckSsoRedirectUri`.
     * @returns {Promise<boolean>}
     */
    init(json, options){
        if(typeof window === 'undefined') return Promise.resolve(false);
        if(this.#initPromise) return this.#initPromise;
        const tidecloakConfig = {
            ...json,
            url: json['auth-server-url'],
            realm: json.realm,
            clientId: json.resource,
            clientOriginAuth: json[`client-origin-auth-${window.location.origin}`],
        };
        if(!this.#core) this.#core = new TideCloak(tidecloakConfig);
        this.#registerEvents();
        if(!this.#initPromise){
            this.#initPromise = this.#core.init({ ...this.#defaultInitOptions(json), ...options }).catch((err) => {
                // A TideCloak instance can only be initialized once, so a retry needs a fresh one.
                this.#initPromise = null;
                this.#core = null;
                throw err;
            });
            return this.#initPromise;
        }
    }
    /**
     * 
     * @param {import("../lib/tidecloak.js").TideCloakLoginOptions?} loginOpts 
     */
    async doLogin(loginOpts){
        await this.#getCore().login(loginOpts);
    }
    /**
     * 
     * @param {import("../lib/tidecloak.js").TideCloakLogoutOptions?} logoutOpts 
     */
    async doLogout(logoutOpts){
        this.#setTokenCookie();
        await this.#getCore().logout(logoutOpts);
    }
    getToken(){
        return this.#getCore().token;
    }
    /**
     * When the access token expires, in browser time (adjusted for server clock skew).
     * @returns {Date | undefined}
     */
    getTokenExp(){
        const exp = this.#getCore().tokenParsed?.exp;
        if (exp === undefined) return undefined;
        return new Date((exp + (this.#core.timeSkew ?? 0)) * 1000);
    }
    getClaim(name){
        return this.#getCore().tokenParsed?.[name]
    }
    getName(){
        return this.#getCore().tokenParsed?.preferred_username;
    }
    hasRealmRole(role){
        return this.#getCore().hasRealmRole(role);
    }
    hasClientRole(role){
        return this.#getCore().hasResourceRole(role);
    }
    updateToken(){
        return this.#getCore().updateToken();
    }
    forceUpdateToken(){
        return this.#getCore().updateToken(-1);
    }
    /**
     * 
     * @param {'ready'|'authSuccess'|'authError'|'authRefreshSuccess'|'authRefreshError'|'logout'|'tokenExpired'} event
     * @param {*Function} callback 
     */
    on(event, callback){
        (this.#listeners[event] ??= []).push(callback);
        return this;
    }
    #emit(event, ...args){
        for (const callback of this.#listeners[event] ?? []) {
            try {
                callback(...args);
            } catch (err) {
                console.error(`[IAMService] '${event}' listener failed:`, err);
            }
        }
    }
    #registerEvents(){
        const core = this.#getCore();
        core.onReady = (auth) => { this.#setTokenCookie(core.token); this.#emit('ready', auth); };
        core.onAuthSuccess = () => this.#emit('authSuccess');
        core.onAuthError = (err) => this.#emit('authError', err);
        core.onAuthRefreshSuccess = () => { this.#setTokenCookie(core.token); this.#emit('authRefreshSuccess'); };
        core.onAuthRefreshError = () => this.#emit('authRefreshError');
        core.onAuthLogout = () => { this.#setTokenCookie(); this.#emit('logout'); };
        core.onTokenExpired = () => this.#emit('tokenExpired');
    }
    /**
     * Mirror the access token into the `kcToken` cookie that the Next.js middleware and proxy read.
     * @param {string} [token] Clears the cookie when omitted.
     */
    #setTokenCookie(token){
        const attributes = `path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
        document.cookie = token
            ? `kcToken=${token}; ${attributes}`
            : `kcToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; ${attributes}`;
    }
     /**
     * Unregister an event listener.
     * @param {string} event
     * @param {Function} handler
     * @returns {this}
     */
    off(event, handler) {
        if (this.#listeners[event]) {
            this.#listeners[event] = this.#listeners[event].filter(fn => fn !== handler);
        }
        return this;
    }
    fetch(url, init = {}) {
        return this.#getCore().fetch(url, init);
    }
    isLoggedIn(){
        return this.#getCore().authenticated;
    }
    /**
     * @param {Record<string, any>} json The contents of tidecloak.json
     * @returns {import("../lib/tidecloak.js").TideCloakInitOptions}
     */
    #defaultInitOptions(json){
        return {
            onLoad: 'check-sso',
            silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
            pkceMethod: 'S256',
            setupRequestEnclave: json.setupRequestEnclave ?? true,
            // DPoP is opt-in: only enable it when tidecloak.json asks for it.
            ...(json.dpopConfig && { dpopConfig: json.dpopConfig }),
            ...(json.checkLoginIframe === false && { checkLoginIframe: false }),
        };
    }
    #getCore(){
        if(!this.#core) throw Error('[IAMService] TidecloakJS not initialized. Make sure to call IAMService.init before using functionalities.')
        return this.#core;
    }
}

export const IAMService = new IAMServiceImplementation()