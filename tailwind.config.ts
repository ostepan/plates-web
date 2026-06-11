import type { Config } from "tailwindcss";

/**
 * The "Iron" design system, transcribed from the iOS app's
 * `PlatesUI/DesignTokens.swift`. Flat, sharp, hairline-ruled, cream + ink,
 * heavy display type with monospaced numerals.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./packages/ui/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F5F3EE",
        card: "#FFFFFF",
        chip: "#ECE8DF",
        ink: "#171614",
        ink2: "#5A554E",
        ink3: "#A8A299",
        rule: "rgba(23,22,20,0.10)",
        hairline: "rgba(23,22,20,0.07)",
        accent: "#C64D2A",
        accentInk: "#7A2C14",
        accentSoft: "#F3DCCF",
        ok: "#3FA055",
        warn: "#D4A544",
        fade: "#D97E3E",
        bad: "#C64D2A",
        info: "#5B7FA1",
      },
      fontFamily: {
        // Geist (same typeface as iOS); falls back to system.
        display: ['"Geist"', "system-ui", "sans-serif"],
        sans: ['"Geist"', "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        eyebrow: "0.14em", // ≙ Kerning.eyebrow 1.4 @ ~10pt
        display2: "-0.02em",
        display: "-0.025em",
      },
      borderWidth: {
        hairline: "1px",
      },
      borderRadius: {
        none: "0",
        iron: "4px",
      },
      keyframes: {
        logflash: {
          "0%": { backgroundColor: "rgba(198,77,42,0.22)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
      animation: {
        logflash: "logflash 0.7s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
