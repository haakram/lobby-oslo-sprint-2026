import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { PRODUCTS, productBySku } from "@/features/catalog/products";
import { serverEnv } from "@/lib/env";
import { appSpend, costUsd, type SpendMeter } from "@/lib/spend";
import { ModelOutput, type IdentifyResult } from "./schema";

export class BudgetExceeded extends Error {
  constructor() {
    super("Claude budget is spent");
  }
}

export class IdentifyRefused extends Error {
  constructor() {
    super("Claude declined to identify this image");
  }
}

const catalogue = PRODUCTS.map((p) => `${p.sku} | ${p.name} | ${p.category} | ${p.description}`).join("\n");

// Stable and first, so it can be cached.
const SYSTEM = `You identify retail and hotel supply products from a photo. Read any visible text on the packaging. Then pick the matching SKU from the catalogue below, or null when nothing matches. Never invent an SKU. Always give a short name and category for what you see, even when sku is null.
Write the name in Norwegian bokmål, at most four words, for the main thing in the middle of the photo (for example "Pute", "Håndkle", "Sjampoflaske", "Rød krakk").
Category: linen for textiles (pillows, cushions, towels, bedding, blankets), hygiene for toiletries (soap, shampoo, toothpaste, lotion), food for food and drink, other for anything else, unknown when you cannot tell.

Catalogue (sku | name | category | description):
${catalogue}`;

type Deps = { client?: Anthropic; meter?: SpendMeter };

export async function identifyProduct(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png",
  deps: Deps = {},
): Promise<IdentifyResult> {
  const meter = deps.meter ?? appSpend;
  if (!meter.canSpend()) throw new BudgetExceeded();
  const client = deps.client ?? new Anthropic({ apiKey: serverEnv().ANTHROPIC_API_KEY, maxRetries: 0 });

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 1024,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ModelOutput) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "Which product is this?" },
        ],
      },
    ],
  });

  meter.record(costUsd(response.usage));
  if (response.stop_reason === "refusal") throw new IdentifyRefused();
  const out = response.parsed_output;
  if (!out) throw new Error("Claude returned no structured answer");

  const product = out.sku ? (productBySku(out.sku) ?? null) : null;
  return {
    sku: product ? product.sku : null,
    name: out.name,
    category: out.category,
    textSeen: out.textSeen,
    confidence: out.confidence,
    product,
  };
}
