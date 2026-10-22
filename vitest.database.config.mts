import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/database/**/*.test.ts"],
    environment: "node",
    maxWorkers: 1,
  },
});
