// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig, { connectSources } from "../../../../next.config";

describe("the CSP's connect-src (next.config.ts)", () => {
  it("allows our own server, ElevenLabs and the local viewer, and nothing from Google", () => {
    const sources = connectSources({ NODE_ENV: "production" }).split(" ");
    expect(sources).toEqual(["'self'", "http://127.0.0.1:8765", "https://*.elevenlabs.io", "wss://*.elevenlabs.io"]);
    expect(sources.join(" ")).not.toMatch(/google|\*(?!\.elevenlabs)/);
  });

  it("follows NEXT_PUBLIC_VIEWER_URL to its origin, and ignores a URL that isn't http(s)", () => {
    expect(connectSources({ NEXT_PUBLIC_VIEWER_URL: "https://viewer.example.no/runs/" })).toContain("https://viewer.example.no ");
    expect(connectSources({ NEXT_PUBLIC_VIEWER_URL: "javascript:alert(1)" })).toContain("http://127.0.0.1:8765");
  });

  it("lets the dev server's hot reload connect only in development", () => {
    expect(connectSources({ NODE_ENV: "development" })).toContain("ws://localhost:*");
    expect(connectSources({ NODE_ENV: "production" })).not.toContain("ws://");
  });

  it("sends connect-src on every route, next to the existing directives", async () => {
    const routes = (await nextConfig.headers?.()) ?? [];
    const csp = routes[0]?.headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    expect(routes[0]?.source).toBe("/:path*");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/connect-src 'self' /);
  });
});
