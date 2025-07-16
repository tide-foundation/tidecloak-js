'use client'
import { FC } from "react";
import { InternalTideCloakProvider, TideCloakProviderProps } from "./InternalTideCloakProvider";


export const TideCloakProvider: FC<TideCloakProviderProps> = ({ config, children }) => (
  <InternalTideCloakProvider config={config}>
    {children}
  </InternalTideCloakProvider>
);
