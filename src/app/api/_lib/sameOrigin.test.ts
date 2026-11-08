// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CROSS_SITE_COPY, refuseCrossSite } from "./sameOrigin";

const at = (headers: Record<string, string>) => new Request("http://localhost:3300/api/scene", { method: "POST", headers });

describe("refuseCrossSite", () => {
  it("lets a same-origin browser request through", () => {
    expect(refuseCrossSite(at({ "sec-fetch-site": "same-origin", origin: "http://localhost:3300", host: "localhost:3300" }))).toBeNull();
  });

  it("lets a typed address (Sec-Fetch-Site: none) and a tool without browser headers through", () => {
    expect(refuseCrossSite(at({ "sec-fetch-site": "none" }))).toBeNull();
    expect(refuseCrossSite(at({}))).toBeNull();
  });

  it("answers 403 to another site, before anything else runs", async () => {
    const res = refuseCrossSite(at({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }));
    expect(res?.status).toBe(403);
    expect(res?.headers.get("cache-control")).toContain("no-store");
    expect(await res?.json()).toEqual({ error: CROSS_SITE_COPY, code: "cross_site" });
  });

  it("answers 403 to a sibling subdomain (same-site is not same-origin)", () => {
    expect(refuseCrossSite(at({ "sec-fetch-site": "same-site" }))?.status).toBe(403);
  });

  it("answers 403 to a foreign Origin even without Sec-Fetch-Site (older browsers)", () => {
    expect(refuseCrossSite(at({ origin: "https://evil.example", host: "localhost:3300" }))?.status).toBe(403);
    expect(refuseCrossSite(at({ origin: "not a url", host: "localhost:3300" }))?.status).toBe(403);
  });
});
