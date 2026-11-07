import { IdentifyRequest, MAX_IMAGE_BYTES } from "./schema";

const DATA_URL = /^data:(image\/jpeg|image\/png);base64,([A-Za-z0-9+/]+={0,2})$/;

export type ImageBody =
  | { ok: true; base64: string; mediaType: "image/jpeg" | "image/png" }
  | { ok: false; error: string };

/** Reads `{ image: "data:image/jpeg;base64,…" }` from a request: JPEG or PNG, at most 1,5 MB. */
export async function readImageBody(request: Request): Promise<ImageBody> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, error: "Ugyldig forespørsel." };
  }
  const parsed = IdentifyRequest.safeParse(raw);
  const match = parsed.success ? DATA_URL.exec(parsed.data.image) : null;
  if (!match) return { ok: false, error: "Send bildet som JPEG eller PNG." };

  const [, mediaType, base64] = match;
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, error: "Bildet er for stort (maks 1,5 MB)." };
  return { ok: true, base64, mediaType: mediaType as "image/jpeg" | "image/png" };
}
