/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  // GitHub Pages serves a project repo under /Bokoring/; local dev stays at root.
  base: command === "build" ? "/Bokoring/" : "/",
  plugins: [react()],
  server: { port: Number(process.env.PORT) || 5173 },
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
}));
