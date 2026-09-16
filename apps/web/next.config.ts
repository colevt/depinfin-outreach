import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@depinfin/compliance", "@depinfin/core", "@depinfin/db"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@depinfin/compliance": path.join(root, "packages/compliance/src/index.ts"),
      "@depinfin/core": path.join(root, "packages/core/src/index.ts"),
      "@depinfin/db": path.join(root, "packages/db/src/index.ts"),
    };
    config.resolve.extensionAlias = {
      ".js": [".ts", ".js"],
    };
    return config;
  },
};

export default nextConfig;
