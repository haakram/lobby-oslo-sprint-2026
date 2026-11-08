import { z } from "zod";
import type { Product } from "@/features/catalog/products";

// Shared with the browser: no server imports in this file.

export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

export const IdentifyRequest = z.object({
  image: z.string(), // data:image/jpeg;base64,… or data:image/png;base64,…
  /** false: leave people out of the answer (the "Personer" switch is off). Default true. */
  people: z.boolean().optional(),
});

/**
 * What a thing is to the hotel. `supply`: a consumable we stock (the catalogue is a list of these);
 * `room`: the hotel's own equipment (pillow, remote); `guest`: something a guest brings and may
 * forget (cap, phone, keys); `person`; `other`.
 */
export const ITEM_KINDS = ["supply", "room", "guest", "person", "other"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Other things in the photo, besides the main one, kept at most. */
export const MAX_SEEN = 8;

const SeenItem = z.object({ name: z.string(), kind: z.enum(ITEM_KINDS) });
export type SeenItem = z.infer<typeof SeenItem>;

export const ModelOutput = z.object({
  sku: z.string().nullable(),
  name: z.string(),
  category: z.enum(["hygiene", "food", "linen", "other", "unknown"]),
  kind: z.enum(ITEM_KINDS),
  /** One sentence about the whole photo, e.g. "En person med caps holder en fjernkontroll." */
  summary: z.string(),
  seen: z.array(SeenItem),
  textSeen: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

export type IdentifyResult = {
  sku: string | null;
  name: string;
  category: Product["category"] | "unknown";
  kind: ItemKind;
  summary: string;
  seen: SeenItem[];
  textSeen: string[];
  confidence: "high" | "medium" | "low";
  product: Product | null;
};
