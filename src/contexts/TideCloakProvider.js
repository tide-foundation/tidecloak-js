import React from "react";
import { TideCloakContextProvider } from "./TideCloakContextProvider";

/**
 * Public API: just supply your JSON path once.
 *
 * @param {object} props
 * @param {string} props.pathToConfig   e.g. "/tidecloak-client.json"
 * @param {ReactNode} props.children
 */
export function TideCloakProvider({
  pathToConfig,
  children,
}) {
  return (
    <TideCloakContextProvider pathToConfig={pathToConfig}>
      {children}
    </TideCloakContextProvider>
  );
}
