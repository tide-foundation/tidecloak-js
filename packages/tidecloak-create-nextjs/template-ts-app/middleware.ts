// an example nextJS middleware router that does server-side validation on all traffic to secure pages
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createTideCloakMiddleware } from "@tidecloak/nextjs/server";
import tcConfig from "./tidecloak.json";

export default createTideCloakMiddleware({
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
  // Note: onError receives (err, req) - the error is the first argument.
  onError: (err: unknown, req: NextRequest) => {
    console.error("[Middleware] error verifying token for", req.nextUrl.pathname, err);
    // if something unexpected happens, redirect to your auth flow
    const redirectUrl = new URL("/auth/redirect", req.url);
    return NextResponse.redirect(redirectUrl);
  },
});

// Tell Next.js which paths to apply this middleware to (bare path and subpaths)
export const config = {
  matcher: ["/protected", "/protected/:path*"],
};
