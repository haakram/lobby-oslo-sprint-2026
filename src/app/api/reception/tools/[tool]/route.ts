import { createReceptionTools, RECEPTION_TOOL_NAMES, type ReceptionToolName } from "@/features/reception/tools";
import { readJsonBody, secretMatches } from "@/features/reception/webhook";
import { receptionEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8192;

// TODO(phase-3): persist webhook records; the call log reads them from ElevenLabs data collection.
const acceptAll = { record: () => "recorded" as const };

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** ElevenLabs webhook tools. Arguments are never logged: they hold names and phone numbers. */
export async function POST(request: Request, { params }: { params: Promise<{ tool: string }> }): Promise<Response> {
  let secret: string | undefined;
  try {
    secret = receptionEnv().RECEPTION_TOOL_SECRET;
  } catch {
    secret = undefined;
  }
  if (!secret) return fail(503, "Verktøyene er ikke satt opp.");
  if (!secretMatches(request.headers.get("x-reception-secret"), secret)) return fail(401, "Ikke tillatt.");

  const { tool } = await params;
  if (!(RECEPTION_TOOL_NAMES as readonly string[]).includes(tool)) return fail(404, "Ukjent verktøy.");

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return fail(body.status, body.status === 413 ? "For stor forespørsel." : "Ugyldig JSON.");

  const handlers = createReceptionTools({ sink: acceptAll });
  const result = await handlers[tool as ReceptionToolName](body.value);
  return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
}
