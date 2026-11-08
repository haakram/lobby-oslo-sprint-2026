import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { serverEnv } from "@/lib/env";
import { appSpend, costUsd, type SpendMeter } from "@/lib/spend";
import { BudgetExceeded } from "./identify";
import {
  LANDMARK_LABELS,
  MAX_LANDMARKS,
  MAX_THINGS,
  SceneModelOutput,
  cleanLandmarks,
  cleanThings,
  type Landmark,
  type Thing,
} from "./sceneSchema";

export class SceneRefused extends Error {
  constructor() {
    super("Claude declined to describe this image");
  }
}

// Stable and first, so it can be cached. The people rule is in the user turn, so the cache holds.
const SYSTEM = `You help a hotel and warehouse robot see. In the photo, find two kinds of things. Give each a tight box normalised to the image: x and y are the top-left corner, w and h the size, all between 0 and 1.
Landmarks: fixed parts of the building. Use only these labels, spelled exactly: ${LANDMARK_LABELS.join(", ")}. Return at most ${MAX_LANDMARKS}, the clearest first.
Things: loose objects the hotel cares about: its equipment (pillows, duvets, remote controls, lamps, kettles, hangers, hair dryers), supplies (toiletries, food and drink, towels) and guests' belongings that may be forgotten (caps and hats, clothes, glasses, phones, chargers, keys, wallets, bags, umbrellas, toys). Include what a person wears or holds, but never the person: no box for a person, never who they are, never their face, body, age or gender. Skip furniture fixed to the room, walls and floors. Name each thing in Norwegian bokmål, at most four words (for example "Caps", "Fjernkontroll", "Pute", "Mobiltelefon"). Category: linen for textiles, hygiene for toiletries, food for food and drink, other for anything else, unknown when you cannot tell. Kind: supply for consumables a hotel stocks, room for the hotel's own equipment, guest for guests' belongings, other for anything else. Return at most ${MAX_THINGS}, the clearest first.
If you see nothing, return empty lists.`;

const QUESTION = "Which landmarks and things do you see?";
const QUESTION_NO_PEOPLE = `${QUESTION} Leave out everything a person wears or holds.`;

/** What one scan sees: landmarks of the building, and loose things. */
export type SceneView = { landmarks: Landmark[]; things: Thing[] };

type Deps = { client?: Anthropic; meter?: SpendMeter };

/** The landmarks and things Claude sees in a photo of the surroundings, cleaned and clamped. */
export async function describeScene(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png",
  deps: Deps = {},
  people = true,
): Promise<SceneView> {
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
          { type: "text", text: people ? QUESTION : QUESTION_NO_PEOPLE },
        ],
      },
    ],
  });

  meter.record(costUsd(response.usage));
  if (response.stop_reason === "refusal") throw new SceneRefused();
  const out = response.parsed_output;
  if (!out) throw new Error("Claude returned no structured answer");
  return { landmarks: cleanLandmarks(out.landmarks), things: cleanThings(out.things) };
}
