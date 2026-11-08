// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const identifyProduct = vi.hoisted(() => vi.fn());
vi.mock("@/features/eyes/identify", () => {
  class BudgetExceeded extends Error {}
  class IdentifyRefused extends Error {}
  return { identifyProduct, BudgetExceeded, IdentifyRefused };
});

import { BudgetExceeded } from "@/features/eyes/identify";
import { PAID_ROUTE_LIMITS, resetPaidRouteLimits } from "@/app/api/_lib/paidRouteLimit";
import { POST } from "./route";

const jpeg = (bytes = 10) => `data:image/jpeg;base64,${Buffer.alloc(bytes, 1).toString("base64")}`;
const call = (body: unknown) =>
  POST(new Request("http://localhost/api/identify", { method: "POST", body: JSON.stringify(body) }));

const result = {
  sku: "FT-1001",
  name: "Sjampo 250 ml",
  category: "hygiene",
  textSeen: [],
  confidence: "high",
  product: null,
};

beforeEach(() => {
  identifyProduct.mockReset();
  resetPaidRouteLimits();
});

describe("POST /api/identify", () => {
  it("rejects a non-image data URL with 400", async () => {
    const res = await call({ image: "data:text/plain;base64,AAAA" });
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(new Request("http://localhost/api/identify", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });

  it("rejects a 2 MB image with 400", async () => {
    const res = await call({ image: jpeg(2 * 1024 * 1024) });
    expect(res.status).toBe(400);
    expect(identifyProduct).not.toHaveBeenCalled();
  });

  it("answers 429 with Norwegian copy when the budget is spent", async () => {
    identifyProduct.mockImplementation(async () => {
      throw new BudgetExceeded();
    });
    const res = await call({ image: jpeg() });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("Dagens kvote for gjenkjenning er brukt opp.");
  });

  it("answers 502 without leaking the model error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    identifyProduct.mockImplementation(async () => {
      throw new Error("sk-ant-secret exploded");
    });
    const res = await call({ image: jpeg() });
    expect(res.status).toBe(502);
    expect(JSON.stringify(log.mock.calls)).not.toContain("sk-ant");
    log.mockRestore();
    expect(JSON.stringify(await res.json())).not.toContain("sk-ant");
  });

  it("returns the identify result on success", async () => {
    identifyProduct.mockResolvedValue(result);
    const res = await call({ image: jpeg() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(identifyProduct.mock.calls[0][1]).toBe("image/jpeg");
  });
  it("answers 429 with Retry-After once a caller's per-minute limit is spent, before any model call", async () => {
    identifyProduct.mockResolvedValue(result);
    const max = PAID_ROUTE_LIMITS["identify"][0]!.max;
    for (let i = 0; i < max; i++) expect((await call({ image: jpeg() })).status).toBe(200);
    const res = await call({ image: jpeg() });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await res.json()).code).toBe("rate_limited");
    expect(identifyProduct).toHaveBeenCalledTimes(max);
  });

  it("refuses a request from another site with 403, before the limit counts or the model is called (round 4, security review)", async () => {
    identifyProduct.mockResolvedValue(result);
    const crossSite = () =>
      POST(new Request("http://localhost/api/identify", { method: "POST", headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" }, body: JSON.stringify({ image: jpeg() }) }));
    const res = await crossSite();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("cross_site");
    expect(identifyProduct).not.toHaveBeenCalled();
    // A refused call is not counted: the caller's whole per-minute allowance is still there.
    const max = PAID_ROUTE_LIMITS["identify"][0]!.max;
    for (let i = 0; i < max; i++) expect((await call({ image: jpeg() })).status).toBe(200);
  });
});
