import type { ModuleService } from "@/features/modules/registry";

/**
 * Whether /stemme can talk: the server has the ElevenLabs key and the Lobby agent's id (the same check
 * /api/voice/token makes). Names only, never values. Server only: it reads the server's environment.
 */
export function voiceAgentReady(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim() && process.env.ELEVENLABS_AGENT_ID?.trim());
}

/** The services this server has set up, for the menu (a screen that needs a missing one stays out). */
export function serverServices(): ModuleService[] {
  return voiceAgentReady() ? ["voice-agent"] : [];
}
