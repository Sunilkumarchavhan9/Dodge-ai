import type { NextConfig } from "next";

const apiOrigin = process.env.API_INTERNAL_ORIGIN?.trim();

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiOrigin) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
