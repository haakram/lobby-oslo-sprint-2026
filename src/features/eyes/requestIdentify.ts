import { productBySku } from "@/features/catalog/products";
import { ModelOutput, type IdentifyResult } from "./schema";

export const QUOTA_COPY = "Dagens kvote for gjenkjenning er brukt opp.";

/** A failed identify, with the copy to show. `quota` is the 429: retrying won't help today. */
export class IdentifyError extends Error {
  constructor(
    readonly title: string,
    readonly quota = false,
  ) {
    super(title);
  }
}

/** POST /api/identify. Throws IdentifyError with user-facing copy, or the AbortError when aborted. */
export async function requestIdentify(image: string, signal?: AbortSignal): Promise<IdentifyResult> {
  let response: Response;
  try {
    response = await fetch("/api/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
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
  const parsed = response.ok ? ModelOutput.safeParse(data) : null;
  if (!parsed?.success) throw new IdentifyError("Fikk ikke kjent igjen varen");
  // The product comes from our own catalogue, never from the response.
  const product = parsed.data.sku ? (productBySku(parsed.data.sku) ?? null) : null;
  return { ...parsed.data, sku: product ? product.sku : null, product };
}
