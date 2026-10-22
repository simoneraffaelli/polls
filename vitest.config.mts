import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/database/**", "node_modules/**"],
    environment: "node",
    // Keep parser, lint and model suites within a predictable memory/CPU budget.
    maxWorkers: 4,
  },
});
