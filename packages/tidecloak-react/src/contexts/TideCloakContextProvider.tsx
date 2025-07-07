import React from "react";
import { IAMService } from 'tidecloak-js'

interface TideCloakContextValue {
  baseURL: string;
  authenticated: boolean;
  loading: boolean;
  reload: () => void;
}

interface TideCloakContextProviderProps {
  config: Record<string, any>;
  children: React.ReactNode;
}

const TideCloakContext = React.createContext<TideCloakContextValue | undefined>(undefined);

export function TideCloakContextProvider({ config, children }: TideCloakContextProviderProps) {
  const [authenticated, setAuthenticated] = React.useState<boolean>(false);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [baseURL, setBaseURL] = React.useState<string>("");
  const [reloadKey, setReloadKey] = React.useState<number>(0);
  const initKey = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (initKey.current === reloadKey) return;
    initKey.current = reloadKey;

    setLoading(true);

    async function initContext() {
      try {
        const loaded = await IAMService.loadConfig(config) as Record<string, any>;
        if (!loaded) {
          console.warn("TideCloak config is invalid:", config);
          return;
        }
        const url = loaded["auth-server-url"] as string;
        setBaseURL(url.replace(/\/+$/, ""));

        const auth = await IAMService.initIAM(config);
        setAuthenticated(!!auth);
      } catch (err: any) {
        console.error("Failed to initialize TideCloak context:", err);
      } finally {
        setLoading(false);
      }
    }

    initContext();
  }, [config, reloadKey]);

  if (loading) return null;
  return (
    <TideCloakContext.Provider
      value={{
        baseURL,
        authenticated,
        loading,
        reload: () => setReloadKey((k) => k + 1),
      }}
    >
      {children}
    </TideCloakContext.Provider>
  );
}

// Custom hook for consuming the context
export function useTideCloakContext(): TideCloakContextValue {
  const ctx = React.useContext(TideCloakContext);
  if (!ctx) {
    throw new Error(
      "useTideCloakContext must be used within a <TideCloakContextProvider>"
    );
  }
  return ctx;
}