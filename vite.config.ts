/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  worker: { format: "es" },
  // Pre-bundle lazily imported deps so the dev server never re-optimizes mid-load (duplicate React).
  optimizeDeps: { include: ["react", "react-dom/client", "zustand", "idb-keyval", "three", "@react-three/fiber"] },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
