'use client'
import React, { ReactNode, FC } from "react";
import { TideCloakContextProvider } from "@tidecloak/react";

interface TideCloakProviderProps {
  config: Record<string, any>;
  children: ReactNode;
}

export const TideCloakProvider: FC<TideCloakProviderProps> = ({ config, children }) => (
  <TideCloakContextProvider config={config}>
    {children}
  </TideCloakContextProvider>
);
