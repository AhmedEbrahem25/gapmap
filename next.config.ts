import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sql.js"],
  // Let phones reach the dev server over the LAN or a Cloudflare quick tunnel.
  allowedDevOrigins: ["*.trycloudflare.com", "192.168.*.*", "10.*.*.*", "172.*.*.*"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
