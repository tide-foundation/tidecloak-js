/** @type {import('next').NextConfig} */
const nextConfig = {
  // CSP: frame-src '*' is required for the Tide SWE iframe (ORK re-homing).
  // Without it, login can hang silently.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-src 'self' *" },
        ],
      },
      // The Tide DPoP auth page runs an inline <script>, so it needs
      // script-src 'unsafe-inline'. Set the CSP via headers() here, NOT via a
      // route handler: the Next.js dev server injects a hash-based CSP on
      // route-handler responses that blocks the inline script.
      {
        source: '/tide_dpop/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'unsafe-inline'" },
          { key: 'Allow-CSP-From', value: '*' },
        ],
      },
    ];
  },

  // The Tide ORK opens a popup/iframe at
  //   /tide_dpop/iss/<hex>/aud/<hex>/tide_dpop_auth.html
  // Rewrite that dynamic path to the static public/tide_dpop_auth.html page.
  // Do NOT serve it from a route handler (see the CSP note above).
  async rewrites() {
    return [
      { source: '/tide_dpop/:path*', destination: '/tide_dpop_auth.html' },
    ];
  },
};

module.exports = nextConfig;
