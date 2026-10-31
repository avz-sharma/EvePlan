import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { securityHeaders } from "./scripts/securityHeaders";

export default defineConfig(({ mode }) => ({
  envDir: "..",
  plugins: [react(), securityHeaders(mode)],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
    environment: "node",
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/api/types.ts", "src/api/schema.d.ts", "src/vite-env.d.ts", "src/**/*.test.*"],
      reporter: ["text", "json-summary"],
      thresholds: { lines: 70 },
    },
  },
}));

