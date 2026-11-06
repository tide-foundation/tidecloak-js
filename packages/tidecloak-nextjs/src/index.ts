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


// Encryption utility
export { RequestEnclave };

// Types
export type { TideCloakContextValue, TideCloakContextProviderProps } from '@tidecloak/react';

// Next.js specific provider
export { TideCloakProvider } from "./contexts/TideCloakProvider"
 