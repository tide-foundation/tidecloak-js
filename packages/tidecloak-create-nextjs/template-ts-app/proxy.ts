// Example Next.js proxy that verifies the access token server-side before a protected page loads.
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createTideCloakProxy } from "@tidecloak/nextjs/server";
import type { TidecloakConfig } from "@tidecloak/nextjs/server";
import rawConfig from "./tidecloak.json";

// tidecloak.json is a placeholder ({}) until `npm run init` provisions the realm
// and writes the real adapter config. Type it via the SDK's own config shape so
// the proxy options type-check regardless of the placeholder's contents.
const tcConfig = rawConfig as TidecloakConfig;

export const proxy = createTideCloakProxy({
  config: tcConfig,
  protectedRoutes: {
    // "offline_access" is granted to every authenticated user, so this protects
    // the route for "any logged-in user". Swap it for a real realm/client role
    // (e.g. "appUser") to demonstrate role-based access control.
    "/protected": ["offline_access"],
  },
  onFailure: (ctx: { token: string | null }, req: NextRequest) => {
    console.debug("Token verification failed", {
      path: req.nextUrl.pathname,
      ctx,
    });
    return NextResponse.json(
      { error: "Access forbidden: invalid token" },
      { status: 403 }
    );
  },
  onSuccess: (ctx: { payload: Record<string, any> }, req: NextRequest) => {
    return NextResponse.next();
  },
  // onError receives (err, req): the error is the first argument.
  onError: (err: unknown, req: NextRequest) => {
    console.error("[Proxy] error verifying token for", req.nextUrl.pathname, err);
    // if something unexpected happens, redirect to your auth flow
    const redirectUrl = new URL("/auth/redirect", req.url);
    return NextResponse.redirect(redirectUrl);
  },
});

// Which paths the proxy runs on (the bare path and its subpaths)
export const config = {
  matcher: ["/protected", "/protected/:path*"],
};
