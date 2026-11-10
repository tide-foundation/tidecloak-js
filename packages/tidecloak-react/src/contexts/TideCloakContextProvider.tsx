import React from "react";
import { IAMService, AdminAPI } from '@tidecloak/js';

// Event callback types
type AuthSuccessCallback = () => void | Promise<void>;
type AuthErrorCallback = (error: Error) => void;
type LogoutCallback = () => void;
type ReauthCallback = () => void;

// Action notification types - generalized for any notification system
export type ActionNotificationType = 'success' | 'error' | 'info' | 'warning';
export interface ActionNotification {
  type: ActionNotificationType;
  title: string;
  message?: string;
  action?: string; // The action that triggered this (e.g., 'approval', 'encrypt', 'decrypt')
}
type ActionNotificationCallback = (notification: ActionNotification) => void;

export interface TideCloakContextValue {
  // Bootstrap state
  isInitializing: boolean;
  initError: Error | null;

  // Session state
  authenticated: boolean;
  sessionExpired: boolean;
  isRefreshing: boolean;
  isLoading: boolean; // Login/logout in progress

  // Network state
  isOffline: boolean;
  wasOffline: boolean;

  // Re-auth state (for 401 handling)
  needsReauth: boolean;

  // Tokens
  token: string | null;
  idToken: string | null;
  tokenExp: number | null;

  // Config
  baseURL: string;

  // IAMService and AdminAPI instances (for passing to external components)
  IAMService: typeof IAMService;
  AdminAPI: typeof AdminAPI;

  // actions
  getConfig: () => Record<string, any>
  reload: () => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>; // Async token getter for interceptors
  refreshToken: () => Promise<boolean>;
  forceRefreshToken: () => Promise<boolean>;
  hasRealmRole: (role: string) => boolean;
  hasClientRole: (role: string) => boolean;
  getValueFromToken: (key: string) => any;
  getValueFromIdToken: (key: string) => any;

  // Re-auth actions
  triggerReauth: () => void;
  clearReauth: () => void;
  resetWasOffline: () => void;

  // Tide actions
  //
  // decryptionPolicy is the SIGNED policy bytes that guard the data. Passing one is what makes the
  // orks run a contract over the request (PolicyEnabledEncryption:1 / PolicyEnabledDecryption:1)
  // instead of encrypting under the caller's key alone; omit it and there is no contract to run.
  doEncrypt: (data: any, decryptionPolicy?: Uint8Array) => Promise<any>;
  doDecrypt: (data: any, decryptionPolicy?: Uint8Array) => Promise<any>;

  // DPoP-aware fetch
  fetch: (url: string | URL | RequestInfo, init?: RequestInit) => Promise<Response>;
  // Tide request signing (for policy creation)
  initializeTideRequest: <T extends { encode: () => Uint8Array }>(request: T) => Promise<T>
  /**
   * Send an initialised request to the Tide network and get back its signatures.
   *
   * The other half of initializeTideRequest. Initialising a request without being able to run it
   * leaves a caller holding something they can do nothing with, which is why this is here.
   *
   * The request is passed through untouched, so any model the network accepts works - including a
   * custom one, which the network matches by the shape of its id rather than from a list.
   */
  executeTideRequest: (request: { encode: () => Uint8Array } | Uint8Array, waitForAll?: boolean) => Promise<Uint8Array[]>
  getVendorId: () => string
  getResource: () => string

  // Tide approval enclave (for change set approvals)
  approveTideRequests: (requests: { id: string; request: Uint8Array }[]) => Promise<{
    id: string;
    approved?: { request: Uint8Array };
    denied?: boolean;
    pending?: boolean;
  }[]>
}

export interface TideCloakContextProviderProps {
  children: React.ReactNode;

  /**
   * Full TideCloak configuration. If not provided, will be fetched from configUrl.
   */
  config?: Record<string, any>;

  /**
   * URL to fetch adapter.json from. Defaults to '/adapter.json'.
   * Only used if config prop is not provided.
   */
  configUrl?: string;

  // Event callbacks for custom handling
  onAuthSuccess?: AuthSuccessCallback;
  onAuthError?: AuthErrorCallback;
  onLogout?: LogoutCallback;
  onReauthRequired?: ReauthCallback;

  /**
   * Callback for action notifications (approvals, encryption, etc.)
   * Use this to integrate with your own notification system (toast, snackbar, etc.)
   *
   * @example
   * ```tsx
   * <TideCloakContextProvider
   *   onActionNotification={({ type, title, message }) => {
   *     toast[type](message || title);
   *   }}
   * >
   * ```
   */
  onActionNotification?: ActionNotificationCallback;
}

const TideCloakContext = React.createContext<TideCloakContextValue | undefined>(undefined);

export function TideCloakContextProvider({
  config: configProp,
  configUrl = '/adapter.json',
  children,
  onAuthSuccess,
  onAuthError,
  onLogout,
  onReauthRequired,
  onActionNotification
}: TideCloakContextProviderProps) {
  // Bootstrap state
  const [isInitializing, setIsInitializing] = React.useState(true);
  const [initError, setInitError] = React.useState<Error | null>(null);

  // Session state
  const [authenticated, setAuthenticated] = React.useState(false);
  const [sessionExpired, setSessionExpired] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  // Network state
  const [isOffline, setIsOffline] = React.useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [wasOffline, setWasOffline] = React.useState(false);

  // Re-auth state
  const [needsReauth, setNeedsReauth] = React.useState(false);

  // Token state
  const [token, setToken] = React.useState<string | null>(null);
  const [idToken, setIdToken] = React.useState<string | null>(null);
  const [tokenExp, setTokenExp] = React.useState<number | null>(null);

  // Config state
  const [baseURL, setBaseURL] = React.useState<string>("");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [resolvedConfig, setResolvedConfig] = React.useState<Record<string, any> | null>(null);

  // Store callbacks in refs to avoid re-subscriptions
  const onAuthSuccessRef = React.useRef(onAuthSuccess);
  const onAuthErrorRef = React.useRef(onAuthError);
  const onLogoutRef = React.useRef(onLogout);
  const onReauthRequiredRef = React.useRef(onReauthRequired);
  const onActionNotificationRef = React.useRef(onActionNotification);

  React.useEffect(() => {
    onAuthSuccessRef.current = onAuthSuccess;
    onAuthErrorRef.current = onAuthError;
    onLogoutRef.current = onLogout;
    onReauthRequiredRef.current = onReauthRequired;
    onActionNotificationRef.current = onActionNotification;
  }, [onAuthSuccess, onAuthError, onLogout, onReauthRequired, onActionNotification]);

  // Network status tracking
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Resolve config - either use provided config or fetch from URL
  React.useEffect(() => {
    let mounted = true;

    const resolveConfig = async () => {
      // Check if configProp contains server connection info (realm, url, etc.)
      // If it does, use it directly. If it only has options (dpopConfig, etc.),
      // fetch adapter.json and merge.
      const hasServerConfig = configProp && (
        configProp.realm || configProp.url || configProp['auth-server-url'] || configProp.authServerUrl
      );

      if (configProp && hasServerConfig) {
        // Config prop has full server config - use it directly
        const finalConfig = { ...configProp };

        if (mounted) {
          setResolvedConfig(finalConfig);
        }
        return;
      }

      // Fetch adapter.json and merge with any config options (dpopConfig, etc.)
      try {
        console.debug(`[TideCloak] Fetching config from ${configUrl}`);
        const response = await fetch(configUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch config from ${configUrl}: ${response.status}`);
        }
        const fetchedConfig = await response.json();

        const finalConfig = {
          ...fetchedConfig,
          ...(configProp || {}),
        };

        if (mounted) {
          console.debug('[TideCloak] Config loaded:', { realm: finalConfig.realm });
          setResolvedConfig(finalConfig);
        }
      } catch (err) {
        if (mounted) {
          console.error('[TideCloak] Failed to load config:', err);
          setInitError(err instanceof Error ? err : new Error(String(err)));
          setIsInitializing(false);
        }
      }
    };

    resolveConfig();

    return () => {
      mounted = false;
    };
  }, [configProp, configUrl]);

  // Main IAMService initialization and event handling
  React.useEffect(() => {
    // Wait for config to be resolved
    if (!resolvedConfig) return;

    let mounted = true;

    /**
     * Publish the SDK's auth state into React state.
     *
     * INVARIANT (do not break it): `authenticated === true` IMPLIES
     * `token !== null`, in every single committed render.
     *
     * This function used to announce `setAuthenticated(true)` SYNCHRONOUSLY and
     * only then `await IAMService.getToken()` to fill `token` in a later
     * microtask. Between those two points React was free to commit a render -
     * and it did, every time - in which the app was `authenticated` but the
     * `token` was still `null`:
     *
     *   1. Init finishes and emits `ready`. IAMService invokes its listeners
     *      WITHOUT awaiting them (IAMService.js), so this async
     *      function only gets as far as its first `await` before control returns.
     *   2. Init resolves -> the init effect below runs
     *      `setIsInitializing(false)`.
     *   3. React commits: `{ isInitializing: false, authenticated: true, token: null }`.
     *      The app un-gates. Consumers mount and immediately fire authenticated
     *      requests (react-query fires on subscribe).
     *   4. A consumer reads `token` from this context, finds `null`, and sends
     *      the request with NO `Authorization` header at all -> the resource
     *      server answers a bare `401` that names none of this.
     *   5. Only THEN does `getToken()` resolve and `setToken()` land - too late,
     *      the request is already out and failed.
     *
     * That is the whole bug: not a stale token, not a missing DPoP proof - an
     * authenticated-but-tokenless window that the app was invited to act in.
     *
     * So: resolve the token FIRST, then publish every field together. All the
     * setState calls below sit in a single continuation, so React 18 auto-batches
     * them into ONE commit - there is no longer any moment at which a consumer
     * can observe `authenticated` without the `token` that makes it usable.
     */
    const updateAuthState = async (eventName?: string) => {
      console.debug(`[TideCloak] Auth state update from: ${eventName}`);
      if (!mounted) return;

      const logged = IAMService.isLoggedIn();

      if (!logged) {
        setAuthenticated(false);
        setSessionExpired(true);
        setToken(null);
        setIdToken(null);
        setTokenExp(null);
        return;
      }

      // Logged in per the SDK - but we do not SAY so until we hold the token.
      let t: string | null = null;
      let idt: string | null = null;
      let exp: number | null = null;
      try {
        t = IAMService.getToken() ?? null;
        idt = IAMService.getIdToken() ?? null;
        // getTokenExp() is a skew-adjusted Date; the context has always exposed a
        // number, documented as the expiry timestamp in epoch seconds.
        const expiresAt = IAMService.getTokenExp();
        exp = expiresAt ? Math.floor(expiresAt.getTime() / 1000) : null;
      } catch (e) {
        console.error("[TideCloak] Failed to get tokens:", e);
      }

      if (!mounted) return;

      // Fail CLOSED. A session we cannot produce a token for is not a session a
      // consumer can do anything with: publishing `authenticated: true` with a
      // null token is precisely what manufactured the 401. If the token could
      // not be read, say we are not authenticated and let the app re-auth.
      if (t === null) {
        setAuthenticated(false);
        setSessionExpired(true);
        setToken(null);
        setIdToken(null);
        setTokenExp(null);
        return;
      }

      // One batched commit: the token is in state in the SAME render that first
      // reports `authenticated: true`.
      setToken(t);
      setIdToken(idt);
      setTokenExp(exp);
      setSessionExpired(false);
      setNeedsReauth(false);
      setAuthenticated(true);
    };

    const handleAuthSuccess = async () => {
      if (!mounted) return;
      setIsLoading(false);
      await updateAuthState('authSuccess');

      // Send notification
      onActionNotificationRef.current?.({
        type: 'success',
        title: 'Logged In',
        message: 'Successfully authenticated',
        action: 'login'
      });

      // Call user's callback
      if (onAuthSuccessRef.current) {
        try {
          await onAuthSuccessRef.current();
        } catch (e) {
          console.error("[TideCloak] onAuthSuccess callback error:", e);
        }
      }
    };

    // IAMService calls listeners with the event's arguments only, so the error comes first.
    const handleAuthError = (error: unknown) => {
      if (!mounted) return;
      setIsLoading(false);
      const err = error instanceof Error ? error : new Error(String(error));

      // Send notification
      onActionNotificationRef.current?.({
        type: 'error',
        title: 'Login Failed',
        message: err.message,
        action: 'login'
      });

      // Call user's callback
      if (onAuthErrorRef.current) {
        onAuthErrorRef.current(err);
      }
    };

    const handleLogout = () => {
      if (!mounted) return;
      setIsLoading(false);
      setAuthenticated(false);
      setToken(null);
      setIdToken(null);
      setTokenExp(null);
      setNeedsReauth(false);

      // Send notification
      onActionNotificationRef.current?.({
        type: 'info',
        title: 'Logged Out',
        message: 'You have been logged out',
        action: 'logout'
      });

      // Call user's callback
      if (onLogoutRef.current) {
        onLogoutRef.current();
      }
    };

    const handleInitError = (error: unknown) => {
      if (!mounted) return;
      const err = error instanceof Error ? error : new Error(String(error));
      setInitError(err);
      setIsInitializing(false);

      // Send notification
      onActionNotificationRef.current?.({
        type: 'error',
        title: 'Initialization Failed',
        message: err.message,
        action: 'init'
      });
    };

    const handleTokenExpired = async () => {
      if (!mounted) return;
      console.debug("[TideCloak] Token expired, attempting refresh...");
      setSessionExpired(true);

      // Send notification
      onActionNotificationRef.current?.({
        type: 'warning',
        title: 'Session Expiring',
        message: 'Refreshing your session...',
        action: 'token'
      });

      try {
        await IAMService.updateToken();
      } catch (refreshError) {
        console.error("[TideCloak] Token refresh failed:", refreshError);
      }
    };

    const handleAuthRefreshSuccess = async () => {
      if (!mounted) return;
      await updateAuthState('authRefreshSuccess');

      // Send notification
      onActionNotificationRef.current?.({
        type: 'success',
        title: 'Session Refreshed',
        message: 'Your session has been refreshed',
        action: 'token'
      });
    };

    const handleAuthRefreshError = async () => {
      if (!mounted) return;
      await updateAuthState('authRefreshError');

      // Send notification
      onActionNotificationRef.current?.({
        type: 'error',
        title: 'Session Refresh Failed',
        message: 'Please log in again',
        action: 'token'
      });
    };

    // Subscribe to IAMService events
    IAMService
      .on('authSuccess', handleAuthSuccess)
      .on('authError', handleAuthError)
      .on('authRefreshSuccess', handleAuthRefreshSuccess)
      .on('authRefreshError', handleAuthRefreshError)
      .on('logout', handleLogout)
      .on('tokenExpired', handleTokenExpired);

    setIsInitializing(true);

    // Initialize
    (async () => {
      try {
        if (Object.keys(resolvedConfig).length === 0) throw new Error("Invalid config");
        setBaseURL(String(resolvedConfig['auth-server-url'] || '').replace(/\/+$/, ''));

        // A failed init rejects (there is no 'initError' event), and lands in the catch below.
        await IAMService.init(resolvedConfig);
        if (!mounted) return;

        // NEVER rely on an event to learn the auth state - read it.
        //
        // The IAMService singleton outlives this component. Whenever this effect
        // RE-runs - a `reloadKey` bump from `reload()` / `approveTideRequests()`, a
        // `resolvedConfig` identity change, a StrictMode double-mount - we
        // re-subscribe from scratch, but the `ready` event that carried the auth
        // state fired during the FIRST init and is long gone: an event is a
        // moment, not a value. `IAMService.init()` hands a repeat caller the same,
        // already-settled promise, so we land here straight away and re-read the
        // CURRENT state instead of serving whatever `token` we happen to hold
        // while the SDK refreshed its own underneath. (That desync is how a `401`
        // gets manufactured: `IAMService.fetch` only adds DPoP when the request
        // carries the token the SDK actually holds, and a `dpop.bound.access.tokens`
        // realm rejects the plain Bearer it falls back to.)
        //
        // On a first init this also guarantees that by the time `isInitializing`
        // flips to false, the token is already in state. `updateAuthState` is
        // idempotent, so a repeat costs a no-op render at worst.
        await updateAuthState('init');
        if (!mounted) return;
        setIsInitializing(false);
      } catch (err: unknown) {
        handleInitError(err);
      }
    })();

    return () => {
      mounted = false;
      IAMService
        .off('authSuccess', handleAuthSuccess)
        .off('authError', handleAuthError)
        .off('authRefreshSuccess', handleAuthRefreshSuccess)
        .off('authRefreshError', handleAuthRefreshError)
        .off('logout', handleLogout)
        .off('tokenExpired', handleTokenExpired);
    };
  }, [resolvedConfig, reloadKey]);

  // Actions
  const login = React.useCallback(async () => {
    setIsLoading(true);
    try {
      await IAMService.doLogin();
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  }, []);

  const logout = React.useCallback(async () => {
    setIsLoading(true);
    try {
      await IAMService.doLogout();
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  }, []);

  const getToken = React.useCallback(async (): Promise<string | null> => {
    try {
      // Hand interceptors a token that is still valid: refresh first if it is about to expire.
      await IAMService.updateToken();
      return IAMService.getToken() ?? null;
    } catch (error) {
      console.error("[TideCloak] getToken error:", error);
      return null;
    }
  }, []);

  const refreshToken = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      return await IAMService.updateToken();
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const forceRefreshToken = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      return await IAMService.forceUpdateToken();
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Re-auth actions
  const triggerReauth = React.useCallback(() => {
    setNeedsReauth(true);

    // Send notification
    onActionNotificationRef.current?.({
      type: 'warning',
      title: 'Re-authentication Required',
      message: 'Please log in again to continue',
      action: 'reauth'
    });

    if (onReauthRequiredRef.current) {
      onReauthRequiredRef.current();
    }
  }, []);

  const clearReauth = React.useCallback(() => {
    setNeedsReauth(false);
  }, []);

  const resetWasOffline = React.useCallback(() => {
    setWasOffline(false);
  }, []);

  // Context value - provide safe defaults during initialization.
  // Memoized so consumers of useTideCloak() only re-render when a value actually
  // changes (not on every provider render), and so the exposed function
  // identities stay stable across unrelated renders.
  const contextValue = React.useMemo<TideCloakContextValue>(() => ({
    // Bootstrap
    isInitializing,
    initError,

    // Session
    authenticated,
    sessionExpired,
    isRefreshing,
    isLoading,

    // Network
    isOffline,
    wasOffline,

    // Re-auth
    needsReauth,

    // Tokens
    token,
    idToken,
    tokenExp,

    // Config
    baseURL,

    // Direct access to service instances
    IAMService,
    AdminAPI,

    getConfig: () => isInitializing ? {} : (resolvedConfig ?? {}),
    reload: () => setReloadKey((k: number) => k + 1),

    // Auth actions
    login,
    logout,
    getToken,
    refreshToken,
    forceRefreshToken,

    // Role checks - return false during initialization
    hasRealmRole: (role: string) => isInitializing ? false : IAMService.hasRealmRole(role),
    hasClientRole: (role: string) => isInitializing ? false : IAMService.hasClientRole(role),

    // Token claims - return undefined during initialization or when not authenticated
    getValueFromToken: (key: string) => (isInitializing || !authenticated) ? undefined : (IAMService.getClaim(key) ?? null),
    getValueFromIdToken: (key: string) => (isInitializing || !authenticated) ? undefined : (IAMService.getIdClaim(key) ?? null),

    // Re-auth actions
    triggerReauth,
    clearReauth,
    resetWasOffline,
    
    // DPoP-aware fetch - falls back to regular fetch during initialization
    
    fetch: (url: string | URL | RequestInfo, init?: RequestInit) =>
      isInitializing ? fetch(url, init) : IAMService.fetch(url, init),
    doEncrypt: async (data: any, decryptionPolicy?: Uint8Array) => {
      if (isInitializing) return null;
      try {
        const result = await IAMService.tide.encrypt(data, decryptionPolicy ?? null);
        onActionNotificationRef.current?.({
          type: 'success',
          title: 'Encrypted',
          message: `${Array.isArray(data) ? data.length : 1} item(s) encrypted`,
          action: 'encrypt'
        });
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onActionNotificationRef.current?.({
          type: 'error',
          title: 'Encryption Failed',
          message: err.message,
          action: 'encrypt'
        });
        throw error;
      }
    },
    doDecrypt: async (data: any, decryptionPolicy?: Uint8Array) => {
      if (isInitializing) return null;
      try {
        const result = await IAMService.tide.decrypt(data, decryptionPolicy ?? null);
        onActionNotificationRef.current?.({
          type: 'success',
          title: 'Decrypted',
          message: `${Array.isArray(data) ? data.length : 1} item(s) decrypted`,
          action: 'decrypt'
        });
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onActionNotificationRef.current?.({
          type: 'error',
          title: 'Decryption Failed',
          message: err.message,
          action: 'decrypt'
        });
        throw error;
      }
    },

    // Tide request signing (for policy creation)
    initializeTideRequest: async <T extends { encode: () => Uint8Array }>(request: T): Promise<T> => {
      const encodedRequest = request.encode();
      const initializedBytes = await IAMService.tide.createTideRequest(encodedRequest);
      const RequestClass = (request as any).constructor;
      if (typeof RequestClass.decode === "function") {
        return RequestClass.decode(initializedBytes) as T;
      }
      return request;
    },

    // Sending an initialised request to be signed. The counterpart to initializeTideRequest.
    executeTideRequest: async (
      request: { encode: () => Uint8Array } | Uint8Array,
      waitForAll: boolean = false
    ): Promise<Uint8Array[]> => {
      // Encoded bytes or something that can encode itself, since a caller who has already
      // initialised a request is holding bytes rather than an object.
      const encoded = request instanceof Uint8Array ? request : request.encode();
      return await IAMService.tide.executeSignRequest(encoded, waitForAll);
    },

    // Get vendor ID from config
    getVendorId: () => {
      const cfg = resolvedConfig ?? {};
      return cfg.vendorId || cfg["vendor-id"] || "";
    },

    // Get resource (client ID) from config
    getResource: () => {
      const cfg = resolvedConfig ?? {};
      return cfg.resource || cfg.clientId || "";
    },

    // Tide approval enclave (for change set approvals)
    approveTideRequests: async (requests: { id: string; request: Uint8Array }[]) => {
      try {
        const response = await IAMService.tide.requestTideOperatorApproval(requests);
        const results = response.map((res: any) => {
          if (res.status === "approved") {
            return { id: res.id, approved: { request: res.request } };
          } else if (res.status === "denied") {
            return { id: res.id, denied: true };
          } else {
            return { id: res.id, pending: true };
          }
        });

        // Send notifications for each result
        const approved = results.filter((r: any) => r.approved).length;
        const denied = results.filter((r: any) => r.denied).length;

        if (approved > 0) {
          onActionNotificationRef.current?.({
            type: 'success',
            title: 'Approved',
            message: `${approved} request${approved > 1 ? 's' : ''} approved successfully`,
            action: 'approval'
          });
        }
        if (denied > 0) {
          onActionNotificationRef.current?.({
            type: 'warning',
            title: 'Denied',
            message: `${denied} request${denied > 1 ? 's' : ''} denied`,
            action: 'approval'
          });
        }

        // Trigger reload to refresh data after approvals
        setReloadKey(k => k + 1);

        return results;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onActionNotificationRef.current?.({
          type: 'error',
          title: 'Approval Failed',
          message: err.message,
          action: 'approval'
        });
        throw error;
      }
    },
  }), [
    isInitializing, initError,
    authenticated, sessionExpired, isRefreshing, isLoading,
    isOffline, wasOffline, needsReauth,
    token, idToken, tokenExp, baseURL, resolvedConfig,
    login, logout, getToken, refreshToken, forceRefreshToken,
    triggerReauth, clearReauth, resetWasOffline,
  ]);

  return (
    <TideCloakContext.Provider value={contextValue}>
      {children}
    </TideCloakContext.Provider>
  );
}

// Default context value for when provider is not available
// This allows graceful degradation in iframes or other contexts
const defaultContextValue: TideCloakContextValue = {
  isInitializing: true,
  initError: null,
  authenticated: false,
  sessionExpired: false,
  isRefreshing: false,
  isLoading: false,
  isOffline: false,
  wasOffline: false,
  needsReauth: false,
  token: null,
  idToken: null,
  tokenExp: null,
  baseURL: '',
  IAMService,
  AdminAPI,
  getConfig: () => ({}),
  reload: () => {},
  login: async () => {},
  logout: async () => {},
  getToken: async () => null,
  refreshToken: async () => false,
  forceRefreshToken: async () => false,
  hasRealmRole: () => false,
  hasClientRole: () => false,
  getValueFromToken: () => undefined,
  getValueFromIdToken: () => undefined,
  triggerReauth: () => {},
  clearReauth: () => {},
  resetWasOffline: () => {},
  doEncrypt: async () => null,
  doDecrypt: async () => null,
  fetch: (url: string | URL | RequestInfo, init?: RequestInit) => fetch(url, init),
  initializeTideRequest: async () => { throw new Error("TideCloakContextProvider not available"); },
  executeTideRequest: async () => { throw new Error("TideCloakContextProvider not available"); },
  getVendorId: () => "",
  getResource: () => "",
  approveTideRequests: async () => { throw new Error("TideCloakContextProvider not available"); },
};

export function useTideCloakContext(): TideCloakContextValue {
  const ctx = React.useContext(TideCloakContext);
  // Return default context if not within provider (e.g., in iframes)
  // This provides graceful degradation instead of throwing
  if (!ctx) {
    console.warn("useTideCloakContext called outside TideCloakContextProvider - returning defaults");
    return defaultContextValue;
  }
  return ctx;
}
