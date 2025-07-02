import React from "react";
import { TideCloakContextProvider } from "./TideCloakContextProvider";

/**
 * Public API: supply your parsed TideCloak JSON config object once.
 *
 * @param {object} props
 * @param {object} props.config Imported TideCloak configuration object.
 * @param {ReactNode} props.children
 */
export function TideCloakProvider({ config, children }) {
  return (
    <TideCloakContextProvider config={config}>
      {children}
    </TideCloakContextProvider>
  );
}
