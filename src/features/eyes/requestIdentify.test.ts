import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentifyError, QUOTA_COPY, requestScene } from "./requestIdentify";

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
