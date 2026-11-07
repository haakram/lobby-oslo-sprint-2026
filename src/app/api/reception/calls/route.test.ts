import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sdk = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    conversationalAi = { conversations: { list: sdk.list } };
  },
}));

import { GET } from "./route";

const AGENT = "agent_test_reception_1";

describe("GET /api/reception/calls", () => {
  beforeEach(() => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-eleven-key-value-0000");
    vi.stubEnv("ELEVENLABS_RECEPTION_AGENT_ID", AGENT);
    sdk.list.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("503 when env is missing", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", undefined);
    expect((await GET()).status).toBe(503);
    expect(sdk.list).not.toHaveBeenCalled();
  });

  it("502 when the SDK throws", async () => {
    sdk.list.mockRejectedValue(new Error("boom with caller name Kari"));
    const response = await GET();
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
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = (await response.json()) as { calls: { id: string; callerName: string }[] };
    expect(body.calls[0]).toMatchObject({ id: "conv_1", callerName: "Kari" });
    expect(sdk.list).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: AGENT, pageSize: 20, summaryMode: "include", dataCollectionIds: expect.arrayContaining(["caller_name", "guests"]) }),
    );
  });
});
