'use client'

import {
  useTideCloak,
  Authenticated,
  Unauthenticated,
  TideCloakContextProvider,
  // Role-based guards
  HasRealmRole,
  HasClientRole,
  // Status components
  Offline,
  Online,
  WasOffline,
  NeedsReauth,
  AuthLoading,
  // Hybrid mode utilities
  useAuthCallback,
  parseCallbackUrl,
  AuthCallback,
  SimpleAuthCallback,
  // Re-export RequestEnclave for encryption
  RequestEnclave
} from '@tidecloak/react';

// Core exports
export {
  useTideCloak,
  Authenticated,
  Unauthenticated,
  TideCloakContextProvider
};

// Role-based guard components
export {
  HasRealmRole,
  HasClientRole
};

// Status components
export {
  Offline,
  Online,
  WasOffline,
  NeedsReauth,
  AuthLoading
};

// Hybrid mode utilities
export {
  useAuthCallback,
  parseCallbackUrl,
  AuthCallback,
  SimpleAuthCallback
};

// Encryption utility
export { RequestEnclave };

// Types
export type { TideCloakContextValue, TideCloakContextProviderProps } from '@tidecloak/react';
export type { AuthCallbackState, UseAuthCallbackOptions, AuthCallbackProps } from '@tidecloak/react';

// Next.js specific provider
export { TideCloakProvider } from "./contexts/TideCloakProvider"
 