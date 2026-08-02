import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api and /assets to the backend during development so the client can
// use same-origin relative URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/assets": "http://localhost:8787",
    },
  },
});
