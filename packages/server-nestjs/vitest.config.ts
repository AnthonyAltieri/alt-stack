import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@alt-stack/server-express": fileURLToPath(
        new URL("../server-express/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
  },
});
