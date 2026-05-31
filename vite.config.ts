import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png"],
      workbox: {
        // SPA: serve the shell for any unmatched navigation (offline deep links)
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,ttf,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: "Plates",
        short_name: "Plates",
        description: "Serious lifting tracker — routines, programs, recovery, progress.",
        theme_color: "#171614",
        background_color: "#F5F3EE",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("./packages/core", import.meta.url)),
      "@ui": fileURLToPath(new URL("./packages/ui", import.meta.url)),
      "@app": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
