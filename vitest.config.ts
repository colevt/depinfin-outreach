import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Point workspace imports at source, not dist, so `pnpm test` works on a
    // clean checkout without a build step.
    alias: {
      "@depinfin/compliance": src("./packages/compliance/src/index.ts"),
      "@depinfin/core": src("./packages/core/src/index.ts"),
      "@depinfin/db": src("./packages/db/src/index.ts"),
      "@depinfin/transport-contract": src("./packages/transports/contract/src/index.ts"),
      "@depinfin/transport-gmail": src("./packages/transports/gmail/src/index.ts"),
      "@depinfin/transport-cold": src("./packages/transports/cold/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts"],
    environment: "node",
  },
});
