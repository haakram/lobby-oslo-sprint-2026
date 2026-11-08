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

/**
 * The whole Content-Security-Policy: everything comes from our own origin unless named here.
 *
 * - script-src: our own files, plus three things the app cannot run without. 'unsafe-inline': the App
 *   Router streams each page's data as small inline <script> chunks; the stricter way, a per-request nonce,
 *   needs src/proxy.ts to mint it on every request (TODO(phase-3)). 'wasm-unsafe-eval': Øyne's detector
 *   (MediaPipe, served from public/mediapipe) compiles WebAssembly; it allows WebAssembly only, not eval().
 *   blob:: the ElevenLabs client (Stemme, Resepsjon) loads its audio worklet from a blob: URL it makes
 *   itself; no other origin can create one. Development only: 'unsafe-eval', which React's dev build uses
 *   for its error stacks.
 * - style-src 'unsafe-inline': server-rendered style="" attributes (the room tiles, the crop preview) and
 *   Next's own style tags; scripts stay the line that matters.
 * - img-src data:: the crop preview on Øyne is a data: URL made on the phone.
 * - No other host anywhere: no CDN, no analytics, no fonts from Google at run time (next/font serves them
 *   from our origin).
 */
export function contentSecurityPolicy(env: Record<string, string | undefined> = process.env): string {
  const dev = env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSources(env)}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// Baseline browser hardening for the public deployment (Vercel adds HSTS itself). Camera and microphone
// stay allowed for this origin only: Øyne and Stemme/Resepsjon need them, nothing else may ask.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
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
