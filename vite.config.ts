import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/tinyroads/" : "/",
  build: {
    // Three.js is intentionally shipped as one cacheable core game bundle.
    // The core is ~156 KB gzip; multiplayer loads separately at ~32 KB gzip.
    chunkSizeWarningLimit: 620,
  },
});
