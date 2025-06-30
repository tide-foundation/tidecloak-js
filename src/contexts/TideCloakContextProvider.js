"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";
import IAMService from "../../lib/IAMService";

const TideCloakContext = createContext(null);

/**
 * Wraps your app, loads the TideCloak JSON at `pathToConfig`,
 * then runs the Keycloak SSO check.
 *
 * @param {object} props
 * @param {string} props.pathToConfig   Path to your JSON (e.g. "/tidecloak-client.json")
 * @param {ReactNode} props.children
 */
export function TideCloakContextProvider({
  pathToConfig,
  children,
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [baseURL, setBaseURL] = useState("");

  useEffect(() => {
    async function initContext() {
      try {
        const config = await IAMService.loadConfig(pathToConfig);
        if (!config) {
          console.warn("TideCloak config not found at", pathToConfig);
          setLoading(false);
          return;
        }

        if (config["auth-server-url"]) {
          setBaseURL(config["auth-server-url"].replace(/\/$/, ""));
        }

        IAMService.initIAM(pathToConfig, (auth) => {
          setAuthenticated(!!auth);
          setLoading(false);
        });
      } catch (err) {
        console.error("Failed to initialize TideCloak context:", err);
        setLoading(false);
      }
    }

    initContext();
  }, [initialized, pathToConfig]);

  return (
    <TideCloakContext.Provider
      value={{
        baseURL,
        authenticated,
        loading,
        setInitialized, // call to re-run if you ever change pathToConfig at runtime
      }}
    >
      {children}
    </TideCloakContext.Provider>
  );
}

/**
 * Hook to consume your TideCloak state.
 */
export function useTideCloakContext() {
  const ctx = useContext(TideCloakContext);
  if (!ctx) {
    throw new Error(
      "useTideCloakContext must be used within a <TideCloakProvider>"
    );
  }
  return ctx;
}
