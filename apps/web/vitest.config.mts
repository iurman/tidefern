import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Component tests render through Testing Library in jsdom; browser behavior
// stays in Playwright (test:e2e). Paths resolve the same "@/" alias as Next.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    // Interaction tests drive jsdom with user-event; on a two-core CI runner with
    // the other workspace suites alongside they can pass Vitest's 5 s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
