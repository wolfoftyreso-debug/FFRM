import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // User-selected image is validated/sanitized server-side and compressed
    // below 320kB before the 46elks MMS request.
    serverActions: { bodySizeLimit: "12mb" },
  },
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
