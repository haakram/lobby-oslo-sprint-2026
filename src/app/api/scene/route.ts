import { BudgetExceeded } from "@/features/eyes/identify";
import { readImageBody } from "@/features/eyes/imageBody";
import { describeScene } from "@/features/eyes/scene";

export const runtime = "nodejs";

const json = (body: unknown, status: number) => Response.json(body, { status });

export async function POST(request: Request) {
  const body = await readImageBody(request);
  if (!body.ok) return json({ error: body.error }, 400);

  try {
    const view = await describeScene(body.base64, body.mediaType, {}, body.people);
    return json(view, 200);
  } catch (error) {
    if (error instanceof BudgetExceeded) {
      return json({ error: "Dagens kvote for gjenkjenning er brukt opp." }, 429);
    }
    // Log only the error type: never the message, which could carry request details.
    console.error("scene failed:", error instanceof Error ? error.name : "unknown");
    return json({ error: "Kunne ikke se omgivelsene. Prøv igjen." }, 502);
  }
}
