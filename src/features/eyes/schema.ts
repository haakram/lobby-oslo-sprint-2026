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
});

export type IdentifyResult = {
  sku: string | null;
  name: string;
  category: Product["category"] | "unknown";
  textSeen: string[];
  confidence: "high" | "medium" | "low";
  product: Product | null;
};
