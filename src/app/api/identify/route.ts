import { BudgetExceeded, identifyProduct } from "@/features/eyes/identify";
import { readImageBody } from "@/features/eyes/imageBody";

export const runtime = "nodejs";

const json = (body: unknown, status: number) => Response.json(body, { status });

export async function POST(request: Request) {
  const body = await readImageBody(request);
  if (!body.ok) return json({ error: body.error }, 400);

  try {
    const result = await identifyProduct(body.base64, body.mediaType, {}, body.people);
    return json(result, 200);
  } catch (error) {
    if (error instanceof BudgetExceeded) {
      return json({ error: "Dagens kvote for gjenkjenning er brukt opp." }, 429);
    }
    // Log only the error type: never the message, which could carry request details.
    console.error("identify failed:", error instanceof Error ? error.name : "unknown");
    return json({ error: "Kunne ikke kjenne igjen produktet. Prøv igjen." }, 502);
  }
}
