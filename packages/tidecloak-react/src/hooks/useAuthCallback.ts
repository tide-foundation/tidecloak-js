import { useState, useEffect, useCallback, useRef } from 'react';
import { IAMService } from '@tidecloak/js';

export interface AuthCallbackState {
  /** Whether this is a callback page (has code or error in URL) */
  isCallback: boolean;
  /** Whether callback processing is in progress */
  isProcessing: boolean;
  /** Whether authentication completed successfully */
  isSuccess: boolean;
  /** Error that occurred during authentication */
  error: Error | null;
  /** URL to return to after authentication */
  returnUrl: string | null;
  /** Authorization code from IdP (if available) */
  code: string | null;
  /** Error code from IdP (if auth was denied) */
  idpError: string | null;
  /** Error description from IdP */
  idpErrorDescription: string | null;
}

export interface UseAuthCallbackOptions {
  /**
   * Whether to automatically process the callback.
   * Set to false for manual control.
   * @default true
   */
  autoProcess?: boolean;

  /**
   * Called when authentication succeeds.
   * Typically used to navigate to returnUrl.
   */
  onSuccess?: (returnUrl: string | null) => void;

  /**
   * Called when authentication fails.
   */
  onError?: (error: Error) => void;

  /**
   * Override the redirect URI (useful when config isn't loaded yet).
   */
  redirectUri?: string;

  /**
   * URL to redirect to if PKCE verifier is missing (e.g., page refresh).
   * Typically the login page.
   */
  onMissingVerifierRedirectTo?: string;
}

/**
 * Parse OAuth callback data from URL and sessionStorage.
 */
function parseCallback(): {
  code: string | null;
  state: string | null;
  verifier: string | null;
  returnUrl: string | null;
  error: string | null;
  errorDescription: string | null;
  isCallback: boolean;
} {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state') || '';
  const error = params.get('error');
  const errorDescription = params.get('error_description');

  const isCallback = !!(code || error);

  // Parse state parameter (format: verifier__url_returnUrl or just returnUrl)
  let verifier: string | null = sessionStorage.getItem('kc_pkce_verifier');
  let returnUrl: string | null = sessionStorage.getItem('kc_return_url');

  // Also try to extract return URL from state if it contains __url_
  if (state && state.includes('__url_')) {
    const urlStart = state.indexOf('__url_') + 6;
    returnUrl = state.substring(urlStart) || returnUrl;
  }

  return {
    code,
    state,
    verifier,
    returnUrl,
    error,
    errorDescription,
    isCallback,
  };
}

/**
 * Hook for handling OAuth callback pages in hybrid mode.
 *
 * Automatically detects if the current page is an OAuth callback and processes it.
 *
 * @example
 * ```tsx
 * function OAuthCallback() {
 *   const { isProcessing, isSuccess, error, returnUrl } = useAuthCallback({
 *     onSuccess: (url) => navigate(url || '/'),
 *     onError: (err) => console.error(err),
 *   });
 *
 *   if (isProcessing) return <Spinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *   return null;
 * }
 * ```
 */
export function useAuthCallback(options: UseAuthCallbackOptions = {}): AuthCallbackState & {
  /** Manually trigger callback processing */
  processCallback: () => Promise<void>;
} {
  const {
    autoProcess = true,
    onSuccess,
    onError,
    onMissingVerifierRedirectTo,
  } = options;

  const [state, setState] = useState<AuthCallbackState>(() => {
    const parsed = parseCallback();

    return {
      isCallback: parsed.isCallback,
      isProcessing: false,
      isSuccess: false,
      error: null,
      returnUrl: parsed.returnUrl,
      code: parsed.code,
      idpError: parsed.error,
      idpErrorDescription: parsed.errorDescription,
    };
  });

  // Track if we've already processed to prevent double-execution in StrictMode
  const processedRef = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  // Keep refs updated
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  const processCallback = useCallback(async () => {
    // Guard against double processing
    if (processedRef.current) return;
    processedRef.current = true;

    setState(s => ({ ...s, isProcessing: true }));

    try {
      const parsed = parseCallback();

      // Check for IdP error first
      if (parsed.error) {
        const error = new Error(parsed.errorDescription || parsed.error);
        setState(s => ({
          ...s,
          isProcessing: false,
          error,
          idpError: parsed.error,
          idpErrorDescription: parsed.errorDescription,
        }));
        onErrorRef.current?.(error);
        return;
      }

      if (!parsed.code) {
        setState(s => ({ ...s, isProcessing: false }));
        return;
      }

      // Check for missing verifier (page was refreshed)
      if (!parsed.verifier) {
        if (onMissingVerifierRedirectTo) {
          window.location.assign(onMissingVerifierRedirectTo);
          return;
        }
        const error = new Error('Session expired. Please try logging in again.');
        setState(s => ({ ...s, isProcessing: false, error }));
        onErrorRef.current?.(error);
        return;
      }

      // Get config and let IAMService handle the callback
      const config = IAMService.getConfig();
      if (!config) {
        const error = new Error('IAMService not configured. Call loadConfig() first.');
        setState(s => ({ ...s, isProcessing: false, error }));
        onErrorRef.current?.(error);
        return;
      }

      // Initialize IAMService which will handle the token exchange
      const authenticated = await IAMService.initIAM(config);

      if (authenticated) {
        // Try to get return URL from sessionStorage since we can't access internal state
        const returnUrl = sessionStorage.getItem('kc_return_url') || parsed.returnUrl;

        setState(s => ({
          ...s,
          isProcessing: false,
          isSuccess: true,
          returnUrl,
        }));
        onSuccessRef.current?.(returnUrl);
      } else {
        const error = new Error('Authentication failed');
        setState(s => ({ ...s, isProcessing: false, error }));
        onErrorRef.current?.(error);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setState(s => ({ ...s, isProcessing: false, error }));
      onErrorRef.current?.(error);
    }
  }, [onMissingVerifierRedirectTo]);

  // Auto-process on mount if enabled and this is a callback
  useEffect(() => {
    if (autoProcess && state.isCallback && !processedRef.current) {
      processCallback();
    }
  }, [autoProcess, state.isCallback, processCallback]);

  return {
    ...state,
    processCallback,
  };
}

/**
 * Parse OAuth callback data from URL without using IAMService.
 * Useful for manual token exchange flows.
 */
export function parseCallbackUrl(): {
  code: string | null;
  state: string | null;
  verifier: string | null;
  returnUrl: string | null;
  error: string | null;
  errorDescription: string | null;
} {
  return parseCallback();
}
