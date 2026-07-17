import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/tinyroads/" : "/",
  build: {
    // Three.js is intentionally shipped as one cacheable game bundle. Its
    // 148 KB gzip size remains inside the project's first-load budget.
    chunkSizeWarningLimit: 600,
  },
});
