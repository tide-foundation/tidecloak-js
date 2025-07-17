import React, { ReactNode, FC } from 'react';
import {
  useTideCloakContext,
} from './contexts/TideCloakContextProvider';

export  { TideCloakContextProvider } from './contexts/TideCloakContextProvider';
export { RequestEnclave, ApprovalEnclave } from "@tidecloak/js";

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
