// an example nextJS middleware router that does server-side validation on all traffic to secure pages
import { NextResponse } from "next/server";
import { createTideCloakMiddleware } from "@tidecloak/nextjs/server";
import tcConfig from "./tidecloak.json";

// Developer should list all secure pages and their respective allowed roles
export default createTideCloakMiddleware({
  config: tcConfig,
  protectedRoutes:{
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
  // Note: onError receives (err, req) - the error is the first argument.
  onError: (err, req) => {
    console.error("[Middleware] ", err);
    return NextResponse.redirect(new URL("/auth/redirect", req.url));
  }
})

//Which routes the middleware should run on (include the bare path and subpaths):
export const config = {
  matcher: ["/protected", "/protected/:path*"],
};