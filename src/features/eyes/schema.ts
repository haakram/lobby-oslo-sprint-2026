import { z } from "zod";
import type { Product } from "@/features/catalog/products";

// Shared with the browser: no server imports in this file.

export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

export const IdentifyRequest = z.object({
  image: z.string(), // data:image/jpeg;base64,… or data:image/png;base64,…
});

export const ModelOutput = z.object({
  sku: z.string().nullable(),
  name: z.string(),
  category: z.enum(["hygiene", "food", "linen", "other", "unknown"]),
  textSeen: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  // No array-length constraint here (structured outputs do not take one): the app keeps the first two.
  alternatives: z
    .array(z.string())
    .describe("Other catalogue SKUs this could be when you are not sure, most likely first; at most two; empty when sure."),
});

/**
 * What /api/identify answers, read in the browser: the model's output, where `alternatives` may be
 * missing (an answer from before it existed reads as none).
 */
export const IdentifyResponse = ModelOutput.extend({ alternatives: z.array(z.string()).optional().default([]) });

export type IdentifyResult = {
  sku: string | null;
  name: string;
  category: Product["category"] | "unknown";
  textSeen: string[];
  confidence: "high" | "medium" | "low";
  product: Product | null;
  /** Other catalogue SKUs it could be when unsure, most likely first (only SKUs the catalogue has). */
  alternatives?: string[];
};
