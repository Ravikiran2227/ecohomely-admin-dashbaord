import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: false,
    css: false,
    restoreMocks: true,
    // The first test that opens the live board imports MapLibre (about 1 MB) while the machine is busy.
    testTimeout: 20_000,
  },
});
