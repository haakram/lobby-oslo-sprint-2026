import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { receptionEnv, type ReceptionEnv } from "@/lib/env";
import { limitPaidRoute } from "@/app/api/_lib/paidRouteLimit";
import { refuseCrossSite } from "@/app/api/_lib/sameOrigin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

/** A short-lived conversation token (WebRTC) for the receptionist agent; the key stays here. */
export async function GET(request: Request): Promise<Response> {
  // Another site is refused before the limit counts or a token is asked for.
  const crossSite = refuseCrossSite(request);
  if (crossSite) return crossSite;
  const limited = limitPaidRoute("reception-token", request);
  if (limited) return limited;
  let env: ReceptionEnv;
  try {
    env = receptionEnv();
  } catch {
    console.error("reception token: server environment is not set up");
    return fail(503, "Resepsjonen er ikke satt opp på serveren.");
  }
  if (!env.ELEVENLABS_RECEPTION_AGENT_ID) {
    return fail(503, "Resepsjonen er ikke satt opp ennå: agenten mangler.");
  }
  try {
    const client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
    const { token } = await client.conversationalAi.conversations.getWebrtcToken({
      agentId: env.ELEVENLABS_RECEPTION_AGENT_ID,
    });
    return Response.json({ token }, { headers: NO_STORE });
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? error.statusCode : undefined;
    console.error("reception token: ElevenLabs refused the token request", { status });
    return fail(502, "Fikk ikke kontakt med stemmetjenesten.");
  }
}
