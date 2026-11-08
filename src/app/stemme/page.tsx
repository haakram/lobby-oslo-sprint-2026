import type { Metadata } from "next";
import { voiceAgentReady } from "@/features/voice/ready";
import { VoiceScreen } from "@/features/voice/VoiceScreen";

export const metadata: Metadata = { title: "Stemme" };

export default function Page() {
  // Names only, never values: whether /api/voice/token can answer (src/lib/env.ts voiceEnv + the agent id).
  // Without the agent the menu leaves this screen out; opened by its address, it says what is missing.
  return <VoiceScreen ready={voiceAgentReady()} />;
}
