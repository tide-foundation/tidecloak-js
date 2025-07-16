'use client'
import { ReactNode, FC } from "react";
import { TideCloakContextProvider } from "@tidecloak/react";

export interface TideCloakProviderProps {
  config: Record<string, any>;
  children: ReactNode;
}

export const InternalTideCloakProvider : FC<TideCloakProviderProps> = ({ config, children }) => (
  <TideCloakContextProvider config={config}>
    {children}
  </TideCloakContextProvider>
);
