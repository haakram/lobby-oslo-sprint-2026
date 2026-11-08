import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { PRODUCTS, productBySku } from "@/features/catalog/products";
import { serverEnv } from "@/lib/env";
import { appSpend, costUsd, type SpendMeter } from "@/lib/spend";
import { MAX_SEEN, ModelOutput, type IdentifyResult } from "./schema";

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

// Stable and first, so it can be cached. The people rule is in the user turn, so the cache holds.
const SYSTEM = `You identify things in a hotel and its warehouse from a photo: supplies, the hotel's equipment, guests' belongings, and people. Read any visible text on the packaging. Then pick the matching SKU from the catalogue below, or null when nothing matches. Never invent an SKU. Always give a short name, category and kind for the main thing in the middle of the photo, even when sku is null.
Write every name in Norwegian bokmål, at most four words (for example "Pute", "Håndkle", "Sjampoflaske", "Caps", "Fjernkontroll", "Person").
Category: linen for textiles (pillows, cushions, towels, bedding, blankets), hygiene for toiletries (soap, shampoo, toothpaste, lotion), food for food and drink, other for anything else, unknown when you cannot tell.
Kind: supply for consumables a hotel stocks (toiletries, food and drink, packed towels and linen); room for the hotel's own equipment and furniture (pillows, duvets, remote controls, lamps, kettles, hangers, hair dryers, chairs, beds); guest for things guests bring and may forget (caps and hats, clothes, glasses, phones, chargers, keys, wallets, bags, umbrellas, toys, jewellery); person for a person; other for anything else.
Summary: one short sentence in Norwegian bokmål about the whole photo. For a person, say what they wear and what they hold (for example "En person med caps holder en fjernkontroll."). Never say who a person is, and never describe their face, body, age or gender.
Seen: up to ${MAX_SEEN} other distinct things in the photo besides the main one, each with a name and kind; what a person wears or holds counts. Empty when there are none.

Catalogue (sku | name | category | description):
${catalogue}`;

const QUESTION = "What is this?";
const QUESTION_NO_PEOPLE =
  "What is this? Leave people out: no person as the main thing, in the summary or in seen, and nothing they wear or hold.";

type Deps = { client?: Anthropic; meter?: SpendMeter };

export async function identifyProduct(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png",
  deps: Deps = {},
  people = true,
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
          { type: "text", text: people ? QUESTION : QUESTION_NO_PEOPLE },
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
    kind: out.kind,
    summary: out.summary,
    seen: out.seen.slice(0, MAX_SEEN),
    textSeen: out.textSeen,
    confidence: out.confidence,
    product,
  };
}
