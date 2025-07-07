import React, { ReactNode, FC } from 'react';

// Import the IAMService singleton
import { IAMService } from 'tidecloak-js'
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

type RenderProp = () => React.ReactNode;

/** Render-prop: calls child only when authenticated */
export function SignedIn({ children }: { children: RenderProp }): React.ReactNode {
  const { authenticated } = useTideCloak();
  return authenticated ? children() : null;
}

/** Render-prop: child only when not authenticated */
export function SignedOut({ children }: { children: RenderProp }): React.ReactNode {
  const { authenticated } = useTideCloak();
  return !authenticated ? children() : null;
}

/**
 * Methods from IAMService.
 */
export const loadConfig = (config: Record<string, any>): Promise<Record<string, any> | null> =>
  IAMService.loadConfig(config);

export const initIAM = (
  config: Record<string, any>,
  onReady?: (authenticated: boolean) => void
): Promise<boolean> => IAMService.initIAM(config, onReady);

export const getConfig = (): Record<string, any> => IAMService.getConfig();
export const isLogged = (): boolean => IAMService.isLoggedIn();
export const getToken = (): Promise<string> => IAMService.getToken();
export const getTokenExp = (): number => IAMService.getTokenExp();
export const getIDToken = (): string => IAMService.getIDToken();
export const getName = (): string => IAMService.getName();
export const hasOneRole = (role: string): boolean => IAMService.hasOneRole(role);
export const getValueFromToken = (key: string): any => IAMService.getValueFromToken(key);
export const getValueFromIDToken = (key: string): any => IAMService.getValueFromIDToken(key);
export const refreshToken = (): Promise<boolean> => IAMService.updateIAMToken();
export const forceRefreshToken = (): Promise<boolean> => IAMService.forceUpdateToken();
export const login = (): void => IAMService.doLogin();
export const logout = (): void => IAMService.doLogout();
export const doEncrypt = (data: any): Promise<any> => IAMService.doEncrypt(data);
export const doDecrypt = (data: any): Promise<any> => IAMService.doDecrypt(data);
export const getBaseUrl = (): string => IAMService.getBaseUrl();

export const on = (
  event: 'ready' | 'initError' | 'authSuccess' | 'authError' |
         'authRefreshSuccess' | 'authRefreshError' | 'logout' | 'tokenExpired',
  handler: (...args: any[]) => void
): void => {
  IAMService.on(event, handler);
};

export const off = (
  event: string,
  handler: (...args: any[]) => void
): void => {
  IAMService.off(event, handler);
};
