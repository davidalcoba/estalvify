import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  resolve: {
    // Mirror the tsconfig "@/*" -> "./*" path alias.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Next's "server-only" marker is a build-time guard; a no-op in node tests.
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next", "app/generated"],
  },
});
