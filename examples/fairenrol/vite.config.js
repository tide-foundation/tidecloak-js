import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pagesBase = "/tidecloak-js/";
const isPagesBuild = Boolean(process.env.GITHUB_ACTIONS);

export default defineConfig({
  base: isPagesBuild ? pagesBase : "/",
  plugins: [react()],
  server: {
    host: "localhost",
    port: 5137,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      plugins: [{
        name: "fairenrol-pages-404",
        closeBundle() {
          const dist = resolve(import.meta.dirname, "dist");
          copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
        },
      }],
    },
  },
});
