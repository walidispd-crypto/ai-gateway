import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Allows the sandbox preview host to load dev assets; production is unaffected.
  allowedDevOrigins: ["*.e2b.app"],
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Omitted when ALLOW_IFRAME_EMBED=1; CSP frame-ancestors is the source of truth.
        ...(process.env.ALLOW_IFRAME_EMBED === "1"
          ? []
          : [{ key: "X-Frame-Options", value: "DENY" }]),
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        },
      ],
    },
  ],
};

export default nextConfig;
