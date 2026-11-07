import type { Metadata } from "next";
import { VoiceScreen } from "@/features/voice/VoiceScreen";

export const metadata: Metadata = { title: "Stemme" };

export default function Page() {
  return <VoiceScreen />;
}
