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
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Plates",
        short_name: "Plates",
        description: "Serious lifting tracker — routines, programs, recovery, progress.",
        theme_color: "#171614",
        background_color: "#F5F3EE",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
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
