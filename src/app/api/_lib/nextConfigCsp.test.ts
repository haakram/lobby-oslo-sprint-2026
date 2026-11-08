// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig, { connectSources, contentSecurityPolicy } from "../../../../next.config";

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

/** The policy as directive → sources, e.g. { "script-src": ["'self'", …] }. */
function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split(";").map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

describe("the whole CSP (next.config.ts)", () => {
  const production = directives(contentSecurityPolicy({ NODE_ENV: "production" }));

  it("falls back to our own origin and closes plugins, base tags, foreign form posts and framing", () => {
    expect(production["default-src"]).toEqual(["'self'"]);
    expect(production["object-src"]).toEqual(["'none'"]);
    expect(production["base-uri"]).toEqual(["'self'"]);
    expect(production["form-action"]).toEqual(["'self'"]);
    expect(production["frame-ancestors"]).toEqual(["'none'"]);
  });

  it("lets scripts come only from our origin: no other host, and no eval() in production", () => {
    expect(production["script-src"]).toEqual(["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "blob:"]);
    expect(production["script-src"]).not.toContain("'unsafe-eval'");
    for (const sources of Object.values(production)) {
      expect(sources.filter((source) => /^https?:|^\*$/.test(source) && !source.endsWith(".elevenlabs.io") && source !== "http://127.0.0.1:8765")).toEqual([]);
    }
  });

  it("adds 'unsafe-eval' for React's dev build only", () => {
    expect(directives(contentSecurityPolicy({ NODE_ENV: "development" }))["script-src"]).toContain("'unsafe-eval'");
  });

  it("names every directive once, and serves the same policy as the header", async () => {
    const csp = contentSecurityPolicy({ NODE_ENV: "production" });
    const names = csp.split(";").map((part) => part.trim().split(/\s+/)[0]);
    expect(new Set(names).size).toBe(names.length);
    const routes = (await nextConfig.headers?.()) ?? [];
    const header = routes[0]?.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    expect(directives(header)["default-src"]).toEqual(["'self'"]);
  });
});
