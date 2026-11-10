import "server-only";

/**
 * The two ElevenLabs REST calls our route handlers make, with plain fetch and the same call shape as
 * `@elevenlabs/elevenlabs-js` (`client.conversationalAi.conversations.getWebrtcToken / list`).
 *
 * Why not the SDK here: its server bundle is ~5 MB (450 KB gzipped), which pushes the Cloudflare Workers
 * build past the free plan's 3 MiB limit for three tiny GET requests. The SDK stays in use for the
 * one-off agent setup scripts (setup-agent.ts) and for its types.
 *
 * Errors carry `statusCode` like the SDK's, so the routes log only the HTTP status, never the body.
 */

const API = "https://api.elevenlabs.io";
const TIMEOUT_MS = 20_000;

export class ElevenLabsHttpError extends Error {
  constructor(readonly statusCode: number) {
    super(`ElevenLabs answered HTTP ${statusCode}`);
    this.name = "ElevenLabsHttpError";
  }
}

type Query = Record<string, string | number | readonly string[] | undefined>;

async function getJson(apiKey: string, path: string, query: Query): Promise<unknown> {
  const url = new URL(path, API);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, item);
    else url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { "xi-api-key": apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new ElevenLabsHttpError(response.status);
  return response.json();
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/** snake_case wire fields → the SDK's camelCase names (only the ones callLog.ts reads). */
function conversationSummary(raw: unknown) {
  const c = record(raw);
  return {
    conversationId: c.conversation_id,
    startTimeUnixSecs: c.start_time_unix_secs,
    callDurationSecs: c.call_duration_secs,
    status: c.status,
    callSummaryTitle: c.call_summary_title,
    transcriptSummary: c.transcript_summary,
    mainLanguage: c.main_language,
    dataCollectionResults: c.data_collection_results,
  };
}

export type ListConversationsRequest = {
  agentId: string;
  pageSize?: number;
  summaryMode?: "include" | "exclude";
  dataCollectionIds?: readonly string[];
};

export class ElevenLabsClient {
  readonly conversationalAi;

  constructor({ apiKey }: { apiKey: string }) {
    this.conversationalAi = {
      conversations: {
        /** GET /v1/convai/conversation/token: a short-lived WebRTC conversation token for one agent. */
        async getWebrtcToken({ agentId }: { agentId: string }): Promise<{ token: string }> {
          const body = record(await getJson(apiKey, "/v1/convai/conversation/token", { agent_id: agentId }));
          if (typeof body.token !== "string" || !body.token) throw new ElevenLabsHttpError(502);
          return { token: body.token };
        },
        /** GET /v1/convai/conversations: the latest conversations of one agent, newest first. */
        async list(request: ListConversationsRequest) {
          const body = record(
            await getJson(apiKey, "/v1/convai/conversations", {
              agent_id: request.agentId,
              page_size: request.pageSize,
              summary_mode: request.summaryMode,
              data_collection_ids: request.dataCollectionIds,
            }),
          );
          const conversations = Array.isArray(body.conversations) ? body.conversations.map(conversationSummary) : [];
          return { conversations, hasMore: body.has_more === true };
        },
      },
    };
  }
}
