import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentifyError, QUOTA_COPY, requestIdentify, requestScene } from "./requestIdentify";

const respond = (status: number, body: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("postImage's 429 handling", () => {
  it("treats the day's quota as final (quota: true)", async () => {
    respond(429, { error: QUOTA_COPY });
    const error = await requestScene("data:image/jpeg;base64,AA").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IdentifyError);
    expect(error).toMatchObject({ title: QUOTA_COPY, quota: true });
  });

  it("treats the per-user rate limit as brief (quota: false), so live recognition is not switched off", async () => {
    respond(429, { error: "For mange forespørsler på kort tid. Vent litt og prøv igjen.", code: "rate_limited" });
    const error = await requestScene("data:image/jpeg;base64,AA").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IdentifyError);
    expect(error).toMatchObject({ quota: false, title: "For mange forespørsler på kort tid. Vent litt og prøv igjen." });
  });
});

describe("requestIdentify", () => {
  const answer = { sku: "FT-1001", name: "Sjampo", category: "hygiene", textSeen: [], confidence: "low" };

  it("reads an answer without alternatives as none, and keeps the rest to the catalogue's SKUs", async () => {
    respond(200, answer);
    expect((await requestIdentify("data:image/jpeg;base64,AA")).alternatives).toEqual([]);
    respond(200, { ...answer, alternatives: ["FT-1003", "FT-9999", "FT-1001"], product: { sku: "FAKE" } });
    const result = await requestIdentify("data:image/jpeg;base64,AA");
    expect(result.alternatives).toEqual(["FT-1003"]);
    expect(result.product?.sku).toBe("FT-1001");
  });
});
