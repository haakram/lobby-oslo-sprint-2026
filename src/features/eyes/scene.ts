import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { serverEnv } from "@/lib/env";
import { appSpend, costUsd, type SpendMeter } from "@/lib/spend";
import { BudgetExceeded } from "./identify";
import { LANDMARK_LABELS, MAX_LANDMARKS, SceneModelOutput, cleanLandmarks, type Landmark } from "./sceneSchema";

export class SceneRefused extends Error {
  constructor() {
    super("Claude declined to describe this image");
  }
}

// Stable and first, so it can be cached.
const SYSTEM = `You help a hotel and warehouse robot find its way. In the photo, find fixed landmarks of the building. Use only these labels, spelled exactly: ${LANDMARK_LABELS.join(", ")}. Return at most ${MAX_LANDMARKS}, the clearest first, each with a box normalised to the image: x and y are the top-left corner, w and h the size, all between 0 and 1. Ignore people, furniture and loose objects. If you see no landmark, return an empty list.`;

type Deps = { client?: Anthropic; meter?: SpendMeter };

/** The landmarks Claude sees in a photo of the surroundings, cleaned and clamped. */
export async function describeScene(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png",
  deps: Deps = {},
): Promise<Landmark[]> {
  const meter = deps.meter ?? appSpend;
  if (!meter.canSpend()) throw new BudgetExceeded();
  const client = deps.client ?? new Anthropic({ apiKey: serverEnv().ANTHROPIC_API_KEY, maxRetries: 0 });

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 1024,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(SceneModelOutput) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "Which landmarks do you see?" },
        ],
      },
    ],
  });

  meter.record(costUsd(response.usage));
  if (response.stop_reason === "refusal") throw new SceneRefused();
  const out = response.parsed_output;
  if (!out) throw new Error("Claude returned no structured answer");
  return cleanLandmarks(out.landmarks);
}
