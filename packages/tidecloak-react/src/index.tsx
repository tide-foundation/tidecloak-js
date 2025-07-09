import React, { ReactNode, FC } from 'react';
import {
  TideCloakContextProvider,
  useTideCloakContext,
} from './contexts/TideCloakContextProvider';

/**
 * Wrap your app and bootstrap TideCloak with the given config object.
 * tidecloak-js expects a plain JSON config, so we type config as Record<string, any>.
 */
export const TideCloakProvider: FC<{ config: Record<string, any>; children: ReactNode }> =
  ({ config, children }) => (
    <TideCloakContextProvider config={config}>
      {children}
    </TideCloakContextProvider>
  );

/**
 * Hook to access authentication state and helpers.
 */
export const useTideCloak = useTideCloakContext;

export function Authenticated({ children }: { children: React.ReactNode }): React.ReactNode {
  const { authenticated, isInitializing } = useTideCloakContext();
  if (isInitializing) return null;
  return authenticated ? children : null;
}

export function Unauthenticated({ children }: { children: React.ReactNode }): React.ReactNode {
  const { authenticated, isInitializing } = useTideCloakContext();
  if (isInitializing) return null;
  return !authenticated ? children : null;
}
