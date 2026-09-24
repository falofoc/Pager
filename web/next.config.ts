import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // STANDALONE=1 عند بناء صورة Docker
  output: process.env.STANDALONE ? "standalone" : undefined,
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "web-push"],
};

export default nextConfig;
