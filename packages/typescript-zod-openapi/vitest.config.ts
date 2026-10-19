import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@alt-stack/http-client-core": fileURLToPath(
        new URL("../http-client-core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
  },
});
