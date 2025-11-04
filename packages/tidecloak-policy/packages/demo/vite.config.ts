import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer(),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      // Import from library source for hot reload
      '@tidecloak/policy/react': path.resolve(__dirname, '../policy/src/react.tsx'),
      '@tidecloak/policy/style.css': path.resolve(__dirname, '../policy/src/style.css'),
      '@tidecloak/policy': path.resolve(__dirname, '../policy/src/index.ts'),
    },
  },
  server: {
    port: 5000,
    host: '0.0.0.0',
    strictPort: true,
    hmr: {
      clientPort: 443,
    },
    allowedHosts: true,
  },
});
