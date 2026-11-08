import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { voiceEnv, type VoiceEnv } from "@/lib/env";

// A fresh token per request; never cached, never prerendered.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

/**
 * A short-lived ElevenLabs conversation token (WebRTC) for the Lobby agent.
 * The API key stays here; the browser only ever sees the token.
 */
export async function GET(): Promise<Response> {
  let env: VoiceEnv;
  try {
    env = voiceEnv();
  } catch {
    // voiceEnv's message names the missing variables, never their values; still, keep it off the wire.
    console.error("voice token: server environment is not set up");
    return fail(503, "Stemmen er ikke satt opp på serveren.");
  }
  if (!env.ELEVENLABS_AGENT_ID) {
    return fail(503, "Stemmen er ikke satt opp ennå: agenten mangler.");
  }

  try {
    const client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
    const { token } = await client.conversationalAi.conversations.getWebrtcToken({
      agentId: env.ELEVENLABS_AGENT_ID,
    });
    return Response.json({ token }, { headers: NO_STORE });
  } catch (error) {
    // Log only the HTTP status the SDK reports; its message may echo request details.
    const status = typeof error === "object" && error && "statusCode" in error ? error.statusCode : undefined;
    console.error("voice token: ElevenLabs refused the token request", { status });
    return fail(502, "Fikk ikke kontakt med stemmetjenesten.");
  }
}
