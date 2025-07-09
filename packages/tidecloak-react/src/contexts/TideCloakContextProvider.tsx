import React from "react";
import { IAMService } from '@tidecloak/js';

interface TideCloakContextValue {
  // bootstrap state
  isInitializing: boolean;
  initError: Error | null;

  // session state
  authenticated: boolean;
  sessionExpired: boolean;
  isRefreshing: boolean;

  // tokens
  token: string | null;
  idToken: string | null;
  tokenExp: number | null;

  // config
  baseURL: string;
  
  // actions
  getConfig: () => Record<string, any>
  reload: () => void;
  login: () => void;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
  forceRefreshToken: () => Promise<boolean>;
  hasRealmRole: (role: string) => boolean;
  hasClientRole: (role: string, resource?: string) => boolean
  getValueFromToken: (key: string) => any;
  getValueFromIdToken: (key: string) => any;

  // Tide actions
  doEncrypt: (data: any) => Promise<any>
  doDecrypt: (data: any) => Promise<any>
}

interface TideCloakContextProviderProps {
  config: Record<string, any>;
  children: React.ReactNode;
}

const TideCloakContext = React.createContext<TideCloakContextValue | undefined>(undefined);

export function TideCloakContextProvider({ config, children }: TideCloakContextProviderProps) {
  const [isInitializing, setIsInitializing] = React.useState(true);
  const [initError, setInitError] = React.useState<Error | null>(null);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [sessionExpired, setSessionExpired] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [token, setToken] = React.useState<string | null>(null);
  const [idToken, setIdToken] = React.useState<string | null>(null);
  const [tokenExp, setTokenExp] = React.useState<number | null>(null);
  const [baseURL, setBaseURL] = React.useState<string>("");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let mounted = true;

    const updateAuthState = async (eventName?: string) => {
      console.debug(`[TideCloak Provider] Updating auth state. Triggered by the ${eventName} event`);
      if (!mounted) return;
      const logged = IAMService.isLoggedIn();
      setAuthenticated(logged);
      if (logged) {
        setSessionExpired(false);
        try {
          const t = await IAMService.getToken();
          const idt = IAMService.getIDToken();
          setToken(t);
          setIdToken(idt);
          setTokenExp(IAMService.getTokenExp());
        } catch (e) {
          console.error("[TideCloak Provider] Failed to update auth state", e);
        }
      } else {
        setSessionExpired(true);
        setToken(null);
        setIdToken(null);
      }
    };

    const onInitError = (err: Error) => {
      if (mounted) {
        setInitError(err);
        setIsInitializing(false);
      }
    };

    const onTokenExpired = async () => {
      if (!mounted) return;
      console.debug("[TideCloak Provider] Token expired, attempting refresh...");
      setSessionExpired(true);
      try {
        await IAMService.updateIAMToken();
      } catch (refreshError) {
        console.error("[TideCloak Provider] Failed to refresh token:", refreshError);
      }
    };

    IAMService
      .on('authSuccess', updateAuthState)
      .on('authError', updateAuthState)
      .on('authRefreshSuccess', updateAuthState)
      .on('authRefreshError', updateAuthState)
      .on('logout', updateAuthState)
      .on('tokenExpired', onTokenExpired)
      .on('initError', onInitError as any);

    setIsInitializing(true);

    (async () => {
      try {
        const loaded = await IAMService.loadConfig(config) as Record<string, any>;;
        if (!loaded) throw new Error("Invalid config");
        setBaseURL((loaded['auth-server-url'] as string).replace(/\/+$/, ''));
        await IAMService.initIAM(config, updateAuthState);
        if (!mounted) return;
        setIsInitializing(false);
      } catch (err: any) {
        onInitError(err);
      }
    })();

    return () => {
      mounted = false;
      IAMService.off('ready', updateAuthState)
        .off('authSuccess', updateAuthState)
        .off('authError', updateAuthState)
        .off('authRefreshSuccess', updateAuthState)
        .off('authRefreshError', updateAuthState)
        .off('logout', updateAuthState)
        .off('tokenExpired', onTokenExpired)
        .off('initError', onInitError as any);
    };
  }, [config, reloadKey]);

  if (isInitializing) return null;

  return (
    <TideCloakContext.Provider
      value={{
        isInitializing,
        initError,
        authenticated,
        sessionExpired,
        isRefreshing,
        token,
        idToken,
        tokenExp,
        baseURL,
        getConfig: () => IAMService.getConfig(),
        reload: () => setReloadKey(k => k + 1),
        login: () => IAMService.doLogin(),
        logout: () => IAMService.doLogout(),
        refreshToken: async () => {
          setIsRefreshing(true);
          try {
            return await IAMService.updateIAMToken();
          } finally {
            setIsRefreshing(false);
          }
        },
        forceRefreshToken: async () => {
          setIsRefreshing(true);
          try {
            return await IAMService.forceUpdateToken();
          } finally {
            setIsRefreshing(false);
          }
        },
        hasRealmRole: (role: string) => IAMService.hasRealmRole(role),
        hasClientRole: (role: string, resource?: string) => IAMService.hasClientRole(role, resource),
        getValueFromToken: (key: string) => IAMService.getValueFromToken(key),
        getValueFromIdToken: (key: string) => IAMService.getValueFromIDToken(key),
        doEncrypt: async (data: any) => await IAMService.doEncrypt(data),
        doDecrypt: async (data: any) => await IAMService.doDecrypt(data)
      }}
    >
      {children}
    </TideCloakContext.Provider>
  );
}

export function useTideCloakContext(): TideCloakContextValue {
  const ctx = React.useContext(TideCloakContext);
  if (!ctx) throw new Error("useTideCloakContext must be used within <TideCloakContextProvider>");
  return ctx;
}
