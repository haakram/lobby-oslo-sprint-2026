import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { RECEPTION_DATA_FIELDS } from "@/features/reception/agentConfig";
import { toCallNotes } from "@/features/reception/callLog";
import { receptionEnv, type ReceptionEnv } from "@/lib/env";
import { parseCallsSince } from "../../_lib/callsSince";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

/**
 * The latest calls to the receptionist, read from ElevenLabs; nothing is stored here. Only staff reach it:
 * src/proxy.ts lets the receptionist and the admin in and answers everyone else 401/403 before this runs
 * (roles.test.ts, proxy.test.ts). Calls before RECEPTION_CALLS_SINCE are left out, at ElevenLabs and again here, and a
 * value that isn't an ISO time with an offset fails closed (503) instead of showing every call.
 */
export async function GET(): Promise<Response> {
  let env: ReceptionEnv;
  try {
    env = receptionEnv();
  } catch {
    console.error("reception calls: server environment is not set up");
    return fail(503, "Resepsjonen er ikke satt opp på serveren.");
  }
  if (!env.ELEVENLABS_RECEPTION_AGENT_ID) {
    return fail(503, "Resepsjonen er ikke satt opp ennå: agenten mangler.");
  }
  const since = parseCallsSince(process.env.RECEPTION_CALLS_SINCE);
  if (!since.ok) {
    console.error("reception calls: RECEPTION_CALLS_SINCE is not an ISO time with an offset");
    return fail(503, "Resepsjonen er ikke satt opp på serveren.");
  }
  try {
    const client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
    const page = await client.conversationalAi.conversations.list({
      agentId: env.ELEVENLABS_RECEPTION_AGENT_ID,
      pageSize: 20,
      summaryMode: "include",
      dataCollectionIds: [...RECEPTION_DATA_FIELDS],
      ...(since.unixSecs !== null && { callStartAfterUnix: since.unixSecs }),
    });
    return Response.json({ calls: toCallNotes(page, { sinceUnixSecs: since.unixSecs }) }, { headers: NO_STORE });
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? error.statusCode : undefined;
    console.error("reception calls: ElevenLabs refused the list request", { status });
    return fail(502, "Fikk ikke hentet samtalene.");
  }
}
