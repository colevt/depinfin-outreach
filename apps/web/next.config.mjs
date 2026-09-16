/** @type {import('next').NextConfig} */
const nextConfig = {
  // Three internal users, one tenant. Nothing here is public.
  reactStrictMode: true,
  // The workspace packages ship TypeScript sources built to dist. Next
  // transpiles them rather than requiring a separate build step in dev.
  transpilePackages: ["@depinfin/core", "@depinfin/compliance", "@depinfin/db"],
  experimental: {
    // Server actions are how every mutation on the desk runs.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
