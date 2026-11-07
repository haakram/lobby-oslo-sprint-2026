import { BudgetExceeded, identifyProduct } from "@/features/eyes/identify";
import { IdentifyRequest, MAX_IMAGE_BYTES } from "@/features/eyes/schema";

export const runtime = "nodejs";

const DATA_URL = /^data:(image\/jpeg|image\/png);base64,([A-Za-z0-9+/]+={0,2})$/;

const json = (body: unknown, status: number) => Response.json(body, { status });

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Ugyldig forespørsel." }, 400);
  }
  const parsed = IdentifyRequest.safeParse(raw);
  const match = parsed.success ? DATA_URL.exec(parsed.data.image) : null;
  if (!match) return json({ error: "Send bildet som JPEG eller PNG." }, 400);

  const [, mediaType, base64] = match;
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) return json({ error: "Bildet er for stort (maks 1,5 MB)." }, 400);

  try {
    const result = await identifyProduct(base64, mediaType as "image/jpeg" | "image/png");
    return json(result, 200);
  } catch (error) {
    if (error instanceof BudgetExceeded) {
      return json({ error: "Claude-budsjettet er brukt opp. Prøv igjen senere." }, 429);
    }
    // Log only the error type: never the message, which could carry request details.
    console.error("identify failed:", error instanceof Error ? error.name : "unknown");
    return json({ error: "Kunne ikke kjenne igjen produktet. Prøv igjen." }, 502);
  }
}
