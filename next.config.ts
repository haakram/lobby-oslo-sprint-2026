import type { NextConfig } from "next";

/** The local 3D viewer the replay can follow live (useHotelReplay.ts: NEXT_PUBLIC_VIEWER_URL, else this). */
const DEFAULT_VIEWER_ORIGIN = "http://127.0.0.1:8765";

function viewerOrigin(raw: string | undefined): string {
  try {
    const url = new URL(raw?.trim() || DEFAULT_VIEWER_ORIGIN);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : DEFAULT_VIEWER_ORIGIN;
  } catch {
    return DEFAULT_VIEWER_ORIGIN;
  }
}

/**
 * Where the browser may send anything (fetch, WebSocket, beacons): our own server, the local 3D viewer,
 * and ElevenLabs for Stemme and Resepsjon (api.* and the LiveKit host livekit.rtc.*, EU residency hosts
 * included). Nothing else: this is what stops MediaPipe's built-in telemetry to Google
 * (odml.pa.googleapis.com) on Øyne; the model and its WASM come from our own public/. The dev server's
 * hot reload uses a WebSocket on the same host.
 */
export function connectSources(env: Record<string, string | undefined> = process.env): string {
  const sources = ["'self'", viewerOrigin(env.NEXT_PUBLIC_VIEWER_URL), "https://*.elevenlabs.io", "wss://*.elevenlabs.io"];
  if (env.NODE_ENV === "development") sources.push("ws://localhost:*", "ws://127.0.0.1:*");
  return sources.join(" ");
}

// Baseline browser hardening for the public deployment (Vercel adds HSTS itself). Camera and microphone
// stay allowed for this origin only: Øyne and Stemme/Resepsjon need them, nothing else may ask.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; connect-src ${connectSources()}`,
  },
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
