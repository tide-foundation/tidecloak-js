// an example nextJS middleware router that does server-side validation on all traffic to secure pages
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createTideCloakMiddleware,
  type TideCloakContext,
} from "@tidecloak/nextjs/server";
import tcConfig from "./tidecloak.json";

export default createTideCloakMiddleware({
  config: tcConfig,
  protectedRoutes: {
    // list each protected route and the roles allowed to access it
    "/protected": ["offline_access"],
  },
  onFailure: (ctx: TideCloakContext, req: NextRequest) => {
    console.debug("Token verification failed", {
      path: req.nextUrl.pathname,
      ctx,
    });
    return NextResponse.json(
      { error: "Access forbidden: invalid token" },
      { status: 403 }
    );
  },
  onSuccess: (ctx: TideCloakContext, req: NextRequest) => {
    return NextResponse.next();
  },
  onError: (
    ctx: TideCloakContext,
    req: NextRequest,
    err: unknown
  ) => {
    console.error("[Middleware] error verifying token for", req.nextUrl.pathname, err);
    // if something unexpected happens, redirect to your auth flow
    const redirectUrl = new URL("/auth/redirect", req.url);
    return NextResponse.redirect(redirectUrl);
  },
});

// Tell Next.js which paths to apply this middleware to
export const config = {
  matcher: ["/protected/:path*"],
};
