import { defineConfig } from "vitest/config";

// Pure-function tests only (parsers, API client, dictionaries): plain node
// environment, no DOM library. Browser globals the code under test touches
// (window.btoa, localStorage, fetch) are stubbed per test file.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
