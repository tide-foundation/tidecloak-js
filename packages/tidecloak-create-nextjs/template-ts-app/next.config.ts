import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Tide crypto packages (@tidecloak/js, @tideorg/js, heimdall-tide) re-export
  // a few symbols from each other that aren't always present in every build.
  // Webpack treats missing re-exports as hard errors by default, which would fail
  // the build even though our code imports those symbols directly from the package
  // that actually defines them. Downgrade that check to a warning.
  //
  // This is also why package.json uses `next dev --webpack` / `next build --webpack`:
  // Next.js 16 defaults to Turbopack, but this webpack config only applies under webpack.
  webpack: (config) => {
    config.module.parser = {
      ...config.module.parser,
      javascript: {
        ...config.module.parser?.javascript,
        reexportExportsPresence: "warn",
      },
    };
    return config;
  },
};

export default nextConfig;
