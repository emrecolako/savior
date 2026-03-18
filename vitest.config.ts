import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"],
    pool: "threads",
    fileParallelism: true,
    poolOptions: {
      threads: {
        minThreads: 4,
        maxThreads: 8,
      },
    },

  },
});
