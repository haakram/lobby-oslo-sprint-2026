import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sdk = vi.hoisted(() => ({ getWebrtcToken: vi.fn() }));

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    conversationalAi = { conversations: { getWebrtcToken: sdk.getWebrtcToken } };
  },
}));

import { GET } from "./route";
import { PAID_ROUTE_LIMITS, resetPaidRouteLimits } from "@/app/api/_lib/paidRouteLimit";
import { RECEPTION_AGENT_ID_DEFAULT } from "@/lib/env";

const KEY = "test-eleven-key-value-0000";
const AGENT = "agent_test_reception_1";

const get = (headers: Record<string, string> = {}) => new Request("http://localhost/api/reception/token", { headers });

describe("GET /api/reception/token", () => {
  beforeEach(() => {
    resetPaidRouteLimits();
    vi.stubEnv("ELEVENLABS_API_KEY", KEY);
    vi.stubEnv("ELEVENLABS_RECEPTION_AGENT_ID", AGENT);
    sdk.getWebrtcToken.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("503 when the key is missing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", undefined);
    expect((await GET(get())).status).toBe(503);
    expect(sdk.getWebrtcToken).not.toHaveBeenCalled();
  });

  it("uses the team's agent when none is set", async () => {
    vi.stubEnv("ELEVENLABS_RECEPTION_AGENT_ID", undefined);
    sdk.getWebrtcToken.mockResolvedValue({ token: "short-lived" });
    expect((await GET(get())).status).toBe(200);
    expect(sdk.getWebrtcToken).toHaveBeenCalledWith({ agentId: RECEPTION_AGENT_ID_DEFAULT });
  });

  it("returns a token for the reception agent, uncached", async () => {
    sdk.getWebrtcToken.mockResolvedValue({ token: "short-lived" });
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: "short-lived" });
    expect(sdk.getWebrtcToken).toHaveBeenCalledWith({ agentId: AGENT });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("502 on SDK failure without leaking the message", async () => {
    sdk.getWebrtcToken.mockRejectedValue(new Error(`401 invalid api key ${KEY}`));
    const response = await GET(get());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(KEY);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(KEY);
  });
  it("answers 429 with Retry-After once a caller's per-minute limit is spent, without asking ElevenLabs", async () => {
    sdk.getWebrtcToken.mockResolvedValue({ token: "short-lived" });
    const max = PAID_ROUTE_LIMITS["reception-token"][0]!.max;
    for (let i = 0; i < max; i++) expect((await GET(get())).status).toBe(200);
    const response = await GET(get());
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(sdk.getWebrtcToken).toHaveBeenCalledTimes(max);
  });

  it("refuses a request from another site with 403, before the limit counts or ElevenLabs is asked (jury round 4, the security juror)", async () => {
    sdk.getWebrtcToken.mockResolvedValue({ token: "short-lived" });
    const response = await GET(get({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("short-lived");
    expect(sdk.getWebrtcToken).not.toHaveBeenCalled();
    const max = PAID_ROUTE_LIMITS["reception-token"][0]!.max;
    for (let i = 0; i < max; i++) expect((await GET(get())).status).toBe(200);
  });
});
