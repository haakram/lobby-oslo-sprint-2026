import { productBySku } from "@/features/catalog/products";
import { ModelOutput, type IdentifyResult } from "./schema";
import { SceneResponse, type Landmark, type Thing } from "./sceneSchema";

export const QUOTA_COPY = "Dagens kvote for gjenkjenning er brukt opp.";

/** A failed call, with the copy to show. `quota` is the 429: retrying won't help today. */
export class IdentifyError extends Error {
  constructor(
    readonly title: string,
    readonly quota = false,
  ) {
    super(title);
  }
}

/** POSTs an image; returns the JSON of a 2xx. Throws IdentifyError, or the AbortError when aborted. */
async function postImage(
  path: string,
  image: string,
  people: boolean,
  failure: string,
  signal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, people }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new IdentifyError("Fikk ikke svar fra serveren");
  }
  const data: unknown = await response.json().catch(() => null);
  if (response.status === 429) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new IdentifyError(typeof message === "string" ? message : QUOTA_COPY, true);
  }
  if (!response.ok) throw new IdentifyError(failure);
  return data;
}

/**
 * POST /api/identify: what the thing is, matched against our own catalogue. `people: false` leaves
 * people out of the answer.
 */
export async function requestIdentify(image: string, signal?: AbortSignal, people = true): Promise<IdentifyResult> {
  const failure = "Fikk ikke kjent igjen varen";
  const parsed = ModelOutput.safeParse(await postImage("/api/identify", image, people, failure, signal));
  if (!parsed.success) throw new IdentifyError(failure);
  // The product comes from our own catalogue, never from the response.
  const product = parsed.data.sku ? (productBySku(parsed.data.sku) ?? null) : null;
  return { ...parsed.data, sku: product ? product.sku : null, product };
}

/** POST /api/scene: the doors, lifts and signs in view, and the loose things (a cap, a pillow). */
export async function requestScene(
  image: string,
  signal?: AbortSignal,
  people = true,
): Promise<{ landmarks: Landmark[]; things: Thing[] }> {
  const failure = "Fikk ikke sett omgivelsene";
  const parsed = SceneResponse.safeParse(await postImage("/api/scene", image, people, failure, signal));
  if (!parsed.success) throw new IdentifyError(failure);
  return parsed.data;
}
