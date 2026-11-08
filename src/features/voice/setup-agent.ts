// Creates the Lobby agent at ElevenLabs, or updates it when ELEVENLABS_AGENT_ID is already set.
// Prints only the agent id. Run only after ShirazIQ's yes:
//
//   npx tsx --env-file=.env src/features/voice/setup-agent.ts
//
// The SDK reads ELEVENLABS_API_KEY from the environment; this script never prints or stores it.
// Put the printed id in .env as ELEVENLABS_AGENT_ID (and in Vercel's project settings).
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { agentConfig } from "./agentConfig";

async function main(): Promise<void> {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not set. Load the env file: npx tsx --env-file=.env …");
  }
  const client = new ElevenLabsClient();
  const existing = process.env.ELEVENLABS_AGENT_ID?.trim();

  if (existing) {
    await client.conversationalAi.agents.update(existing, agentConfig);
    console.log(existing);
    return;
  }
  const { agentId } = await client.conversationalAi.agents.create(agentConfig);
  console.log(agentId);
}

main().catch((error: unknown) => {
  // Status only: an SDK message can echo request details.
  const status = typeof error === "object" && error && "statusCode" in error ? error.statusCode : undefined;
  console.error(`setup-agent failed${status ? ` (HTTP ${String(status)})` : ""}.`);
  if (!status && error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
