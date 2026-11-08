import type { NextConfig } from "next";

// Baseline browser hardening for the public deployment (Vercel adds HSTS itself). Camera and microphone
// stay allowed for this origin only: Øyne and Stemme/Resepsjon need them, nothing else may ask.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The "N" dev badge covered the phone bar on the projector (UX audit).
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
