import { ElevenLabsClient } from "@/lib/elevenlabs";
import { RECEPTION_DATA_FIELDS } from "@/features/reception/agentConfig";
import { toCallNotes } from "@/features/reception/callLog";
import { receptionEnv, type ReceptionEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

// TODO(phase-3): staff log-in before a real phone number; today anyone with the URL can read call notes.
/** The latest calls to the receptionist, read from ElevenLabs; nothing is stored here. */
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
  try {
    const client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
    const page = await client.conversationalAi.conversations.list({
      agentId: env.ELEVENLABS_RECEPTION_AGENT_ID,
      pageSize: 20,
      summaryMode: "include",
      dataCollectionIds: [...RECEPTION_DATA_FIELDS],
    });
    return Response.json({ calls: toCallNotes(page) }, { headers: NO_STORE });
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? error.statusCode : undefined;
    console.error("reception calls: ElevenLabs refused the list request", { status });
    return fail(502, "Fikk ikke hentet samtalene.");
  }
}
