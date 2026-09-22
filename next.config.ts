import type { NextConfig } from "next";

const noIndexHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/spieler/:path*", headers: noIndexHeaders },
      { source: "/admin", headers: noIndexHeaders },
      { source: "/api/ics/:path*", headers: noIndexHeaders },
    ];
  },
};

export default nextConfig;
