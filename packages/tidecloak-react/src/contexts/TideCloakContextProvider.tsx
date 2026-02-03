import React from "react";
import { IAMService, NativeAdapter, AdminAPI } from '@tidecloak/js';

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
  hasClientRole: (role: string, resource?: string) => boolean;
  getValueFromToken: (key: string) => any;
  getValueFromIdToken: (key: string) => any;

  // Re-auth actions
  triggerReauth: () => void;
  clearReauth: () => void;
  resetWasOffline: () => void;

  // Tide actions
  doEncrypt: (data: any) => Promise<any>
  doDecrypt: (data: any) => Promise<any>

  // Tide request signing (for policy creation)
  initializeTideRequest: <T extends { encode: () => Uint8Array }>(request: T) => Promise<T>
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

  /**
   * Authentication mode. Must be explicitly specified.
   * - 'native': For Electron/Tauri/React Native apps (requires adapter prop)
   * - undefined: Standard frontchannel mode (browser-based)
   */
  authMode?: 'native';

  /**
   * Native adapter for Electron/Tauri/React Native apps.
   * Required when authMode is 'native'.
   *
   * @example
   * ```tsx
   * <TideCloakContextProvider
   *   authMode="native"
   *   adapter={createElectronAdapter()}
   * >
   *   <App />
   * </TideCloakContextProvider>
   * ```
   */
  adapter?: NativeAdapter;

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
  authMode,
  adapter,
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
      // Validate native mode requirements
      if (authMode === 'native' && !adapter) {
        const err = new Error('[TideCloak] authMode="native" requires an adapter prop');
        if (mounted) {
          setInitError(err);
          setIsInitializing(false);
        }
        return;
      }

      // If config is provided directly, use it
      if (configProp) {
        const finalConfig = {
          ...configProp,
          ...(authMode && { authMode }),
          ...(adapter && { adapter }),
        };

        if (mounted) {
          setResolvedConfig(finalConfig);
        }
        return;
      }

      // Otherwise, fetch from configUrl
      try {
        console.debug(`[TideCloak] Fetching config from ${configUrl}`);
        const response = await fetch(configUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch config from ${configUrl}: ${response.status}`);
        }
        const fetchedConfig = await response.json();

        const finalConfig = {
          ...fetchedConfig,
          ...(authMode && { authMode }),
          ...(adapter && { adapter }),
        };

        if (mounted) {
          console.debug('[TideCloak] Config loaded:', {
            realm: finalConfig.realm,
            authMode: finalConfig.authMode || 'frontchannel',
            hasAdapter: !!finalConfig.adapter,
          });
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
  }, [configProp, configUrl, authMode, adapter]);

  // Main IAMService initialization and event handling
  React.useEffect(() => {
    // Wait for config to be resolved
    if (!resolvedConfig) return;

    let mounted = true;

    const updateAuthState = async (eventName?: string) => {
      console.debug(`[TideCloak] Auth state update from: ${eventName}`);
      if (!mounted) return;

      const logged = IAMService.isLoggedIn();
      setAuthenticated(logged);

      if (logged) {
        setSessionExpired(false);
        setNeedsReauth(false);
        try {
          const t = await IAMService.getToken();
          const idt = IAMService.getIDToken();
          setToken(t);
          setIdToken(idt);
          setTokenExp(IAMService.getTokenExp());
        } catch (e) {
          console.error("[TideCloak] Failed to get tokens:", e);
        }
      } else {
        setSessionExpired(true);
        setToken(null);
        setIdToken(null);
      }
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

    const handleAuthError = (_event: string, error: unknown) => {
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

    const handleInitError = (err: Error) => {
      if (!mounted) return;
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
        await IAMService.updateIAMToken();
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
      .on('tokenExpired', handleTokenExpired)
      .on('initError', handleInitError as any);

    setIsInitializing(true);

    // Initialize
    (async () => {
      try {
        const loaded = await IAMService.loadConfig(resolvedConfig) as Record<string, any>;
        if (!loaded) throw new Error("Invalid config");
        setBaseURL((loaded['auth-server-url'] as string || '').replace(/\/+$/, ''));
        await IAMService.initIAM(resolvedConfig, updateAuthState);
        if (!mounted) return;
        setIsInitializing(false);
      } catch (err: any) {
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
        .off('tokenExpired', handleTokenExpired)
        .off('initError', handleInitError as any);
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
      return await IAMService.getToken();
    } catch (error) {
      console.error("[TideCloak] getToken error:", error);
      return null;
    }
  }, []);

  const refreshToken = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      return await IAMService.updateIAMToken();
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

  // Context value - provide safe defaults during initialization
  const contextValue: TideCloakContextValue = {
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

    getConfig: () => isInitializing ? {} : IAMService.getConfig(),
    reload: () => setReloadKey((k: number) => k + 1),

    // Auth actions
    login,
    logout,
    getToken,
    refreshToken,
    forceRefreshToken,

    // Role checks - return false during initialization
    hasRealmRole: (role: string) => isInitializing ? false : IAMService.hasRealmRole(role),
    hasClientRole: (role: string, resource?: string) => isInitializing ? false : IAMService.hasClientRole(role, resource),

    // Token claims - return undefined during initialization or when not authenticated
    getValueFromToken: (key: string) => (isInitializing || !authenticated) ? undefined : IAMService.getValueFromToken(key),
    getValueFromIdToken: (key: string) => (isInitializing || !authenticated) ? undefined : IAMService.getValueFromIDToken(key),

    // Re-auth actions
    triggerReauth,
    clearReauth,
    resetWasOffline,

    // Tide encryption - return null during initialization
    doEncrypt: async (data: any) => {
      if (isInitializing) return null;
      try {
        const result = await IAMService.doEncrypt(data);
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
    doDecrypt: async (data: any) => {
      if (isInitializing) return null;
      try {
        const result = await IAMService.doDecrypt(data);
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
      const tc = (IAMService as any)._tc;
      if (!tc?.createTideRequest) {
        throw new Error("TideCloak createTideRequest not available");
      }
      const encodedRequest = request.encode();
      const initializedBytes = await tc.createTideRequest(encodedRequest);
      const RequestClass = (request as any).constructor;
      if (typeof RequestClass.decode === "function") {
        return RequestClass.decode(initializedBytes) as T;
      }
      return request;
    },

    // Get vendor ID from config
    getVendorId: () => {
      const cfg = IAMService.getConfig() as any;
      return cfg?.vendorId || cfg?.["vendor-id"] || "";
    },

    // Get resource (client ID) from config
    getResource: () => {
      const cfg = IAMService.getConfig() as any;
      return cfg?.resource || cfg?.clientId || "";
    },

    // Tide approval enclave (for change set approvals)
    approveTideRequests: async (requests: { id: string; request: Uint8Array }[]) => {
      const tc = (IAMService as any)._tc;
      if (!tc?.requestTideOperatorApproval) {
        const error = new Error("TideCloak approval enclave not available");
        onActionNotificationRef.current?.({
          type: 'error',
          title: 'Approval Failed',
          message: error.message,
          action: 'approval'
        });
        throw error;
      }

      try {
        const response = await tc.requestTideOperatorApproval(requests);
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
  };

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
  initializeTideRequest: async () => { throw new Error("TideCloakContextProvider not available"); },
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
