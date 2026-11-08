import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A fake ElevenLabs SDK: records what it was built with and asked for, never calls the network.
const sdk = vi.hoisted(() => ({
  constructedWith: [] as unknown[],
  getWebrtcToken: vi.fn(),
}));

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    conversationalAi = { conversations: { getWebrtcToken: sdk.getWebrtcToken } };
    constructor(options: unknown) {
      sdk.constructedWith.push(options);
    }
  },
}));

import { GET } from "./route";
import { PAID_ROUTE_LIMITS, resetPaidRouteLimits } from "@/app/api/_lib/paidRouteLimit";

// Made-up test values, never real keys.
const KEY = "test-eleven-key-value-0000";
const AGENT = "agent_test_value_1111";

const get = (headers: Record<string, string> = {}) => new Request("http://localhost/api/voice/token", { headers });

describe("GET /api/voice/token", () => {
  beforeEach(() => {
    resetPaidRouteLimits();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-value-2222");
    vi.stubEnv("ELEVENLABS_API_KEY", KEY);
    vi.stubEnv("ELEVENLABS_AGENT_ID", AGENT);
    sdk.constructedWith.length = 0;
    sdk.getWebrtcToken.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("answers 503 when the agent id is unset, without calling ElevenLabs", async () => {
    vi.stubEnv("ELEVENLABS_AGENT_ID", undefined);
    const response = await GET(get());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expect(sdk.getWebrtcToken).not.toHaveBeenCalled();
  });

  it("works without ANTHROPIC_API_KEY: voice does not depend on Claude's key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    sdk.getWebrtcToken.mockResolvedValue({ token: "short-lived-token", conversationId: "conv_1" });
    const response = await GET(get());
    expect(response.status).toBe(200);
  });

  it("answers 503 when the ElevenLabs key is missing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", undefined);
    const response = await GET(get());
    expect(response.status).toBe(503);
    expect(sdk.getWebrtcToken).not.toHaveBeenCalled();
  });

  it("returns a conversation token for the configured agent", async () => {
    sdk.getWebrtcToken.mockResolvedValue({ token: "short-lived-token", conversationId: "conv_1" });
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: "short-lived-token" });
    expect(sdk.getWebrtcToken).toHaveBeenCalledWith({ agentId: AGENT });
    expect(sdk.constructedWith).toEqual([{ apiKey: KEY }]);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("never puts the key in the body or the logs, even when ElevenLabs fails", async () => {
    sdk.getWebrtcToken.mockRejectedValue(new Error(`401 invalid api key ${KEY}`));
    const response = await GET(get());
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).not.toContain(KEY);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain(KEY);
  });

  it("never puts the key in a successful body", async () => {
    sdk.getWebrtcToken.mockResolvedValue({ token: "short-lived-token", conversationId: "conv_1" });
    const body = await (await GET(get())).text();
    expect(body).not.toContain(KEY);
  });
  it("answers 429 with Retry-After once a caller's per-minute limit is spent, without asking ElevenLabs", async () => {
    sdk.getWebrtcToken.mockResolvedValue({ token: "short-lived" });
    const max = PAID_ROUTE_LIMITS["voice-token"][0]!.max;
    for (let i = 0; i < max; i++) expect((await GET(get())).status).toBe(200);
    const response = await GET(get());
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(sdk.getWebrtcToken).toHaveBeenCalledTimes(max);
  });
});
