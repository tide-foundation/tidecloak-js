import React from 'react';
import { useTideCloakContext } from './contexts/TideCloakContextProvider';
import type { TideCloakContextValue, TideCloakContextProviderProps } from './contexts/TideCloakContextProvider';

export { TideCloakContextProvider } from './contexts/TideCloakContextProvider';
export type { TideCloakContextValue, TideCloakContextProviderProps } from './contexts/TideCloakContextProvider';
export { RequestEnclave } from "@tidecloak/js";

// Hybrid mode utilities
export { useAuthCallback, parseCallbackUrl } from './hooks/useAuthCallback';
export type { AuthCallbackState, UseAuthCallbackOptions } from './hooks/useAuthCallback';
export { AuthCallback, SimpleAuthCallback } from './components/AuthCallback';
export type { AuthCallbackProps } from './components/AuthCallback';

/**
 * Hook to access authentication state and helpers.
 * Must be used within a TideCloakContextProvider.
 */
export const useTideCloak = useTideCloakContext;

/**
 * Renders children only when user is authenticated.
 */
export function Authenticated({ children }: { children: React.ReactNode }): React.ReactNode {
  const { authenticated, isInitializing } = useTideCloakContext();
  if (isInitializing) return null;
  return authenticated ? children : null;
}

/**
 * Renders children only when user is NOT authenticated.
 */
export function Unauthenticated({ children }: { children: React.ReactNode }): React.ReactNode {
  const { authenticated, isInitializing } = useTideCloakContext();
  if (isInitializing) return null;
  return !authenticated ? children : null;
}

/**
 * Renders children only when user has the specified realm role.
 */
export function HasRealmRole({
  role,
  children,
  fallback = null
}: {
  role: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}): React.ReactNode {
  const { authenticated, isInitializing, hasRealmRole } = useTideCloakContext();
  if (isInitializing) return null;
  if (!authenticated) return fallback;
  return hasRealmRole(role) ? children : fallback;
}

/**
 * Renders children only when user has the specified client/resource role.
 */
export function HasClientRole({
  role,
  resource,
  children,
  fallback = null
}: {
  role: string;
  resource?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}): React.ReactNode {
  const { authenticated, isInitializing, hasClientRole } = useTideCloakContext();
  if (isInitializing) return null;
  if (!authenticated) return fallback;
  return hasClientRole(role, resource) ? children : fallback;
}

/**
 * Renders children only when user is offline.
 */
export function Offline({ children }: { children: React.ReactNode }): React.ReactNode {
  const { isOffline } = useTideCloakContext();
  return isOffline ? children : null;
}

/**
 * Renders children only when user is online.
 */
export function Online({ children }: { children: React.ReactNode }): React.ReactNode {
  const { isOffline } = useTideCloakContext();
  return !isOffline ? children : null;
}

/**
 * Renders children when the user was offline at some point during the session.
 * Useful for showing "sync needed" banners.
 */
export function WasOffline({
  children,
  onReset
}: {
  children: React.ReactNode;
  onReset?: () => void;
}): React.ReactNode {
  const { wasOffline, resetWasOffline } = useTideCloakContext();

  const handleReset = React.useCallback(() => {
    resetWasOffline();
    onReset?.();
  }, [resetWasOffline, onReset]);

  if (!wasOffline) return null;

  // If children is a function, pass the reset handler
  if (typeof children === 'function') {
    return (children as (reset: () => void) => React.ReactNode)(handleReset);
  }

  return children;
}

/**
 * Renders children when re-authentication is needed (e.g., after 401).
 */
export function NeedsReauth({ children }: { children: React.ReactNode }): React.ReactNode {
  const { needsReauth } = useTideCloakContext();
  return needsReauth ? children : null;
}

/**
 * Renders loading state during login/logout operations.
 */
export function AuthLoading({ children }: { children: React.ReactNode }): React.ReactNode {
  const { isLoading } = useTideCloakContext();
  return isLoading ? children : null;
}
