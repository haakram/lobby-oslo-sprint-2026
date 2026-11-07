// Creates the receptionist agent at ElevenLabs, or updates it when ELEVENLABS_RECEPTION_AGENT_ID is
// already set. Prints only the agent id. Run only after ShirazIQ's yes:
//
//   npx tsx --conditions=react-server --env-file=.env src/features/reception/setup-agent.ts
//
// (`--conditions=react-server` lets it load src/lib/env.ts, which is marked server-only.)
//
// Browser demo: leave RECEPTION_PUBLIC_URL unset and the tools are client tools.
// Phone: set RECEPTION_PUBLIC_URL (the deployed https app) and RECEPTION_TOOL_SECRET; the script
// stores the secret at ElevenLabs as a workspace secret and the tools become webhooks to
// /api/reception/tools/<name> carrying it in the x-reception-secret header.
//
// WARNING: webhook mode sends ALL tool calls to the server, so the browser's live cards ("Denne
// samtalen") stay empty and requests appear only in Samtalelogg after the call. Stay in client mode
// (RECEPTION_PUBLIC_URL unset) for the browser demo; use a separate phone agent if you need both.
//
// This script never prints or stores a key or the secret. Put the printed id in .env as
// ELEVENLABS_RECEPTION_AGENT_ID (and in Vercel's project settings).
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { receptionEnv } from "../../lib/env";
import { receptionAgentConfig, type ToolMode } from "./agentConfig";

async function main(): Promise<void> {
  const env = receptionEnv();
  const client = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });

  let mode: ToolMode = { kind: "client" };
  if (env.RECEPTION_PUBLIC_URL) {
    if (!env.RECEPTION_TOOL_SECRET) {
      throw new Error("RECEPTION_TOOL_SECRET is required when RECEPTION_PUBLIC_URL is set.");
    }
    const { secretId } = await client.conversationalAi.secrets.create({
      name: "reception-tool-secret",
      value: env.RECEPTION_TOOL_SECRET,
    });
    mode = { kind: "webhook", baseUrl: env.RECEPTION_PUBLIC_URL, secretId };
  }
  const config = receptionAgentConfig(mode);

  const existing = env.ELEVENLABS_RECEPTION_AGENT_ID;
  if (existing) {
    await client.conversationalAi.agents.update(existing, config);
    console.log(existing);
    return;
  }
  const { agentId } = await client.conversationalAi.agents.create(config);
  console.log(agentId);
}

main().catch((error: unknown) => {
  // Status only: an SDK message can echo request details.
  const status = typeof error === "object" && error && "statusCode" in error ? error.statusCode : undefined;
  console.error(`setup-agent failed${status ? ` (HTTP ${String(status)})` : ""}.`);
  if (!status && error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
