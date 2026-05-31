import { defineConfig } from "vitest/config";

// Unit + integration tests live under packages/. The Playwright e2e specs in
// tests/ run via `npm run e2e`, not Vitest.
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
    exclude: ["node_modules", "dist", "tests"],
  },
});
