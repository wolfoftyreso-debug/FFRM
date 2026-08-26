import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  async redirects() {
    return [
      {
        source: "/inbox/:path*",
        destination: "/messages/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
