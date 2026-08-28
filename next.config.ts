import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // User-selected image is validated/sanitized server-side and compressed
    // below 320kB before the 46elks MMS request.
    // 10 style screenshots × 4MB plus form overhead; Vercel Functions accept
    // up to 100MB requests. Each image is decoded/sanitized before persistence.
    serverActions: { bodySizeLimit: "45mb" },
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
