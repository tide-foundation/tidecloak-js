"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { IAMService } from "../IAMService";

const TideCloakContext = createContext(null);

/**
 * Wraps your app, loads the imported TideCloak config object,
 * then runs the Keycloak SSO check. Children are only rendered
 * after initialization completes.
 *
 * @param {object} props
 * @param {object} props.config     Imported TideCloak configuration object.
 * @param {ReactNode} props.children
 */
export function TideCloakContextProvider({ config, children }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [baseURL, setBaseURL] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const initKey = useRef(null);

  useEffect(() => {
    // If we've already initialized for *this* reloadKey, skip
    if (initKey.current === reloadKey) return;
    initKey.current = reloadKey;

    setLoading(true);

    async function initContext() {
      try {
        const loaded = await IAMService.loadConfig(config);
        if (!loaded) {
          console.warn("TideCloak config is invalid:", config);
          return;
        }
        const url = loaded["auth-server-url"];
        if (url) setBaseURL(url.replace(/\/$/, ""));

        // initIAM should be idempotent; if it isn't, you can check didInitialize here
        const auth = await IAMService.initIAM(config);
        setAuthenticated(!!auth);
      } catch (err) {
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
        reload: () => setReloadKey(k => k + 1),
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
      "useTideCloakContext must be used within a <TideCloakContextProvider>"
    );
  }
  return ctx;
}
