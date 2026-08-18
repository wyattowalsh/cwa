import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const exportCore = fileURLToPath(new URL("./inject/export-core.js", import.meta.url));

export default defineConfig({
  test: {
    environment: "happy-dom",
    include    : ["tests/**/*.test.js"],
    alias      : {
      "@cwa/export-core": exportCore,
    },
  },
});
