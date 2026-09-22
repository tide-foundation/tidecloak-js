// Example Next.js proxy that verifies the access token server-side before a protected page loads.
import { NextResponse } from "next/server";
import { createTideCloakProxy } from "@tidecloak/nextjs/server";
import tcConfig from "./tidecloak.json";

// List every secure page and the roles allowed to see it
export const proxy = createTideCloakProxy({
  config: tcConfig,
  protectedRoutes: {
    // "offline_access" is granted to every authenticated user, so this protects
    // the route for "any logged-in user". Swap it for a real realm/client role
    // (e.g. "appUser") to demonstrate role-based access control.
    "/protected": ["offline_access"]
  },
  onFailure: (ctx, req) => {
    console.debug("Token verification failed");
    return NextResponse.json(
      { error: 'Access forbidden: invalid token' },
      { status: 403 }
    )
  },
  onSuccess: (ctx, req) => {
    return NextResponse.next();
  },
  // onError receives (err, req): the error is the first argument.
  onError: (err, req) => {
    console.error("[Proxy] ", err);
    return NextResponse.redirect(new URL("/auth/redirect", req.url));
  }
})

// Which paths the proxy runs on (the bare path and its subpaths)
export const config = {
  matcher: ["/protected", "/protected/:path*"],
};
