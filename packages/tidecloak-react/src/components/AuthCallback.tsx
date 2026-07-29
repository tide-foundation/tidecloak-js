import React from 'react';
import { useAuthCallback, UseAuthCallbackOptions } from '../hooks/useAuthCallback';

export interface AuthCallbackProps extends UseAuthCallbackOptions {
  /**
   * Component to render while processing the callback.
   * @default null
   */
  loadingComponent?: React.ReactNode;

  /**
   * Component to render when authentication fails.
   * Receives the error as a prop.
   */
  errorComponent?: React.ComponentType<{ error: Error }> | React.ReactNode;

  /**
   * Component to render when authentication succeeds.
   * Receives the returnUrl as a prop.
   */
  successComponent?: React.ComponentType<{ returnUrl: string | null }> | React.ReactNode;

  /**
   * Children to render when this is not a callback page.
   */
  children?: React.ReactNode;
}

/**
 * Component for handling OAuth callback pages in hybrid mode.
 *
 * Drop this component into your callback route and it handles everything:
 * - Detecting if this is a callback page
 * - Processing the authorization code
 * - Exchanging tokens with your backend
 * - Calling onSuccess/onError callbacks
 *
 * @example
 * ```tsx
 * // Simple usage with navigation
 * function OAuthCallbackPage() {
 *   const navigate = useNavigate();
 *
 *   return (
 *     <AuthCallback
 *       onSuccess={(returnUrl) => navigate(returnUrl || '/')}
 *       onError={(error) => console.error(error)}
 *       loadingComponent={<Spinner />}
 *       errorComponent={({ error }) => <Alert status="error">{error.message}</Alert>}
 *     />
 *   );
 * }
 *
 * // Or in routes directly
 * <Route path="/auth/callback" element={
 *   <AuthCallback
 *     onSuccess={(url) => window.location.assign(url || '/')}
 *     loadingComponent={<LoadingScreen />}
 *   />
 * } />
 * ```
 */
export function AuthCallback({
  loadingComponent = null,
  errorComponent,
  successComponent,
  children,
  ...options
}: AuthCallbackProps): React.ReactNode {
  const { isCallback, isProcessing, isSuccess, error, returnUrl } = useAuthCallback(options);

  // Not a callback page - render children or nothing
  if (!isCallback) {
    return children ?? null;
  }

  // Processing
  if (isProcessing) {
    return loadingComponent;
  }

  // Error
  if (error) {
    if (errorComponent) {
      if (typeof errorComponent === 'function') {
        const ErrorComponent = errorComponent as React.ComponentType<{ error: Error }>;
        return <ErrorComponent error={error} />;
      }
      return errorComponent;
    }
    return null;
  }

  // Success
  if (isSuccess) {
    if (successComponent) {
      if (typeof successComponent === 'function') {
        const SuccessComponent = successComponent as React.ComponentType<{ returnUrl: string | null }>;
        return <SuccessComponent returnUrl={returnUrl} />;
      }
      return successComponent;
    }
    return null;
  }

  return null;
}

/**
 * Simple callback page that auto-redirects on success.
 * Use this when you just want the callback handled with minimal UI.
 *
 * @example
 * ```tsx
 * <Route path="/auth/callback" element={
 *   <SimpleAuthCallback
 *     defaultRedirect="/"
 *     loginPage="/login"
 *     loadingComponent={<FullPageSpinner />}
 *   />
 * } />
 * ```
 */
export function SimpleAuthCallback({
  defaultRedirect = '/',
  loginPage = '/login',
  loadingComponent,
  errorComponent,
}: {
  /** URL to redirect to if no returnUrl is available */
  defaultRedirect?: string;
  /** URL to redirect to if verifier is missing (page refreshed) */
  loginPage?: string;
  /** Component to show while processing */
  loadingComponent?: React.ReactNode;
  /** Component to show on error */
  errorComponent?: React.ComponentType<{ error: Error }> | React.ReactNode;
}): React.ReactNode {
  return (
    <AuthCallback
      onSuccess={(returnUrl) => {
        window.location.assign(returnUrl || defaultRedirect);
      }}
      onMissingVerifierRedirectTo={loginPage}
      loadingComponent={loadingComponent}
      errorComponent={errorComponent}
    />
  );
}
