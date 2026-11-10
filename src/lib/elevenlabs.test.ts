import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ElevenLabsClient, ElevenLabsHttpError } from "./elevenlabs";

const KEY = "test-eleven-key-value-0000";

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function calledUrl(fetchMock: ReturnType<typeof stubFetch>): URL {
  return new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
}

describe("ElevenLabsClient (fetch-only)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for a WebRTC token with the key in the header, not the URL", async () => {
    const fetchMock = stubFetch(200, { token: "short-lived" });
    const client = new ElevenLabsClient({ apiKey: KEY });
    await expect(client.conversationalAi.conversations.getWebrtcToken({ agentId: "agent_1" })).resolves.toEqual({
      token: "short-lived",
    });
    const url = calledUrl(fetchMock);
    expect(url.origin + url.pathname).toBe("https://api.elevenlabs.io/v1/convai/conversation/token");
    expect(url.searchParams.get("agent_id")).toBe("agent_1");
    expect(url.toString()).not.toContain(KEY);
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);
  });

  it("throws an error with only the HTTP status when ElevenLabs refuses", async () => {
    stubFetch(401, { detail: `invalid key ${KEY}` });
    const client = new ElevenLabsClient({ apiKey: KEY });
    const error = await client.conversationalAi.conversations.getWebrtcToken({ agentId: "a" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ElevenLabsHttpError);
    expect((error as ElevenLabsHttpError).statusCode).toBe(401);
    expect(String(error)).not.toContain(KEY);
  });

  it("lists conversations with repeated data_collection_ids and maps them to camelCase", async () => {
    const fetchMock = stubFetch(200, {
      conversations: [
        {
          conversation_id: "conv_1",
          start_time_unix_secs: 1_700_000_000,
          call_duration_secs: 10,
          status: "done",
          call_summary_title: "Booking",
          transcript_summary: "Wants a room",
          main_language: "no",
          data_collection_results: { caller_name: { value: "Kari" } },
        },
      ],
      has_more: false,
    });
    const client = new ElevenLabsClient({ apiKey: KEY });
    const page = await client.conversationalAi.conversations.list({
      agentId: "agent_1",
      pageSize: 20,
      summaryMode: "include",
      dataCollectionIds: ["caller_name", "guests"],
    });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/v1/convai/conversations");
    expect(url.searchParams.get("page_size")).toBe("20");
    expect(url.searchParams.get("summary_mode")).toBe("include");
    expect(url.searchParams.getAll("data_collection_ids")).toEqual(["caller_name", "guests"]);
    expect(page).toEqual({
      conversations: [
        {
          conversationId: "conv_1",
          startTimeUnixSecs: 1_700_000_000,
          callDurationSecs: 10,
          status: "done",
          callSummaryTitle: "Booking",
          transcriptSummary: "Wants a room",
          mainLanguage: "no",
          dataCollectionResults: { caller_name: { value: "Kari" } },
        },
      ],
      hasMore: false,
    });
  });
});
