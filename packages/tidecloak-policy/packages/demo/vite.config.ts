import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      // Import from library source for hot reload
      '@tidecloak/policy/react': path.resolve(__dirname, '../policy/src/react.tsx'),
      '@tidecloak/policy/style.css': path.resolve(__dirname, '../policy/src/style.css'),
      '@tidecloak/policy': path.resolve(__dirname, '../policy/src/index.ts'),
    },
  },
});
