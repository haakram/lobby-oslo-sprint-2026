import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sdk = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    conversationalAi = { conversations: { list: sdk.list } };
  },
}));

import { GET } from "./route";

const get = (headers: Record<string, string> = {}) => new Request("http://localhost/api/reception/calls", { headers });

const AGENT = "agent_test_reception_1";

describe("GET /api/reception/calls", () => {
  beforeEach(() => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-eleven-key-value-0000");
    vi.stubEnv("ELEVENLABS_RECEPTION_AGENT_ID", AGENT);
    vi.stubEnv("RECEPTION_CALLS_SINCE", "");
    sdk.list.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("503 when env is missing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", undefined);
    expect((await GET(get())).status).toBe(503);
    expect(sdk.list).not.toHaveBeenCalled();
  });

  it("502 when the SDK throws", async () => {
    sdk.list.mockRejectedValue(new Error("boom with caller name Kari"));
    const response = await GET(get());
    expect(response.status).toBe(502);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Kari");
  });

  it("maps conversations to call notes", async () => {
    sdk.list.mockResolvedValue({
      conversations: [
        {
          conversationId: "conv_1",
          startTimeUnixSecs: 1_700_000_000,
          callDurationSecs: 10,
          status: "done",
          dataCollectionResults: { caller_name: { value: "Kari" } },
        },
      ],
      hasMore: false,
    });
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = (await response.json()) as { calls: { id: string; callerName: string }[] };
    expect(body.calls[0]).toMatchObject({ id: "conv_1", callerName: "Kari" });
    expect(sdk.list).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: AGENT, pageSize: 20, summaryMode: "include", dataCollectionIds: expect.arrayContaining(["caller_name", "guests"]) }),
    );
    expect(sdk.list.mock.calls[0]?.[0]).not.toHaveProperty("callStartAfterUnix");
  });

  it("leaves out every call before RECEPTION_CALLS_SINCE, at ElevenLabs and again on our side", async () => {
    vi.stubEnv("RECEPTION_CALLS_SINCE", "2026-11-08T05:30:00+01:00");
    const cutoff = Date.UTC(2026, 10, 8, 4, 30) / 1000;
    const call = (id: string, at: number, name: string) => ({
      conversationId: id,
      startTimeUnixSecs: at,
      callDurationSecs: 30,
      status: "done",
      dataCollectionResults: { caller_name: { value: name } },
    });
    // The team's test call of 7 Nov comes back anyway (an API that ignores the filter): it must still not show.
    sdk.list.mockResolvedValue({
      conversations: [call("conv_demo", cutoff + 60, "Demo Gjest"), call("conv_test", cutoff - 86_400, "Ekte Testperson")],
      hasMore: false,
    });
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(sdk.list).toHaveBeenCalledWith(expect.objectContaining({ callStartAfterUnix: cutoff }));
    const body = await response.text();
    expect(body).toContain("Demo Gjest");
    expect(body).not.toContain("Ekte Testperson");
  });

  it("fails closed (503, nothing read) when RECEPTION_CALLS_SINCE is not an ISO time with an offset", async () => {
    vi.stubEnv("RECEPTION_CALLS_SINCE", "8. november");
    const response = await GET(get());
    expect(response.status).toBe(503);
    expect(sdk.list).not.toHaveBeenCalled();
  });

  it("refuses a request from another site with 403, before ElevenLabs is asked (round 4, security review)", async () => {
    const response = await GET(get({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(sdk.list).not.toHaveBeenCalled();
  });

  it("still answers a same-origin request from the app", async () => {
    sdk.list.mockResolvedValue({ conversations: [], hasMore: false });
    const response = await GET(get({ "sec-fetch-site": "same-origin" }));
    expect(response.status).toBe(200);
  });
});
