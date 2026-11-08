import { describe, expect, it } from "vitest";
import { receptionAgentConfig } from "./agentConfig";
import { CALL_PRIVACY, callNotice } from "./callPrivacy";
import { HOTEL } from "./hotel";

describe("callNotice", () => {
  it("says where the call goes, what is kept and asks for a made-up name", () => {
    expect(callNotice()).toBe(
      "Samtalen går til ElevenLabs (USA), som sender teksten til Claude (Anthropic, USA) for å svare. " +
        `Ingen lydopptak lagres, og teksten slettes etter ${HOTEL.privacy.retentionDays} dager. ` +
        "Dette er en demo: bruk et oppdiktet navn og nummer.",
    );
  });

  it("follows the setting: a recorded call says the recording is kept too", () => {
    expect(callNotice({ recordVoice: true, retentionDays: 7 })).toContain("Lydopptaket og teksten slettes etter 7 dager.");
  });

  it("promises no more than the agent is set up with: no audio, the same retention, a Claude model", () => {
    const agent = receptionAgentConfig({ kind: "client" });
    expect(agent.platformSettings?.privacy).toEqual(CALL_PRIVACY);
    expect(agent.conversationConfig.agent?.prompt?.llm).toMatch(/^claude-/);
  });
});
