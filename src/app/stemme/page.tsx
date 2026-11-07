import type { Metadata } from "next";
import { VoiceScreen } from "@/features/voice/VoiceScreen";

export const metadata: Metadata = { title: "Stemme" };

export default function Page() {
  // Names only, never values: whether /api/voice/token can answer (src/lib/env.ts voiceEnv + the agent id).
  const ready = Boolean(process.env.ELEVENLABS_API_KEY?.trim() && process.env.ELEVENLABS_AGENT_ID?.trim());
  return <VoiceScreen ready={ready} />;
}
