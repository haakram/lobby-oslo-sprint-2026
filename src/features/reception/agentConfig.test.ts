import { describe, expect, it } from "vitest";
import { directPrice, HOTEL, ROOM_TYPES } from "./hotel";
import {
  RECEPTION_DATA_FIELDS,
  RECEPTION_LANGUAGES,
  receptionAgentConfig,
} from "./agentConfig";
import { RECEPTION_TOOL_NAMES } from "./tools";

const client = receptionAgentConfig({ kind: "client" });
const webhook = receptionAgentConfig({
  kind: "webhook",
  baseUrl: "https://fettero.example",
  secretId: "secret-id-123",
});

const prompt = client.conversationConfig.agent.prompt.prompt;

describe("receptionAgentConfig, client mode", () => {
  it("has the five reception tools as client tools", () => {
    const tools = client.conversationConfig.agent.prompt.tools;
    expect(tools.map((t) => t.type)).toEqual(["client", "client", "client", "client", "client"]);
    expect(tools.map((t) => t.name)).toEqual([...RECEPTION_TOOL_NAMES]);
  });
});

describe("receptionAgentConfig, webhook mode", () => {
  it("posts each tool to our route with the secret header", () => {
    const tools = webhook.conversationConfig.agent.prompt.tools;
    expect(tools).toHaveLength(5);
    tools.forEach((tool, i) => {
      if (tool.type !== "webhook") throw new Error("expected a webhook tool");
      expect(tool.name).toBe(RECEPTION_TOOL_NAMES[i]);
      expect(tool.apiSchema.url).toBe(`https://fettero.example/api/reception/tools/${tool.name}`);
      expect(tool.apiSchema.method).toBe("POST");
      expect(tool.apiSchema.requestHeaders).toEqual({
        "x-reception-secret": { secretId: "secret-id-123" },
      });
      expect(tool.apiSchema.requestBodySchema?.type).toBe("object");
    });
  });

  it("keeps the same prompt as client mode", () => {
    expect(webhook.conversationConfig.agent.prompt.prompt).toBe(prompt);
  });
});

describe("reception prompt", () => {
  it("names the hotel and every room's two prices", () => {
    expect(prompt).toContain("Lobby");
    expect(prompt).toContain("Your name is Maria");
    for (const room of ROOM_TYPES) {
      expect(prompt).toContain(String(directPrice(room)));
      expect(prompt).toContain(String(room.otaPrice));
    }
  });

  it("hangs up after one goodbye, and after one warning to an abusive caller", () => {
    expect(prompt).toMatch(/say one short goodbye and call end_call in the same\s+turn/);
    expect(prompt).toMatch(/Never say goodbye twice/);
    expect(prompt).toMatch(/At the next insult, say a short goodbye and call end_call at once/);
    const endCall = client.conversationConfig.agent.prompt.builtInTools.endCall;
    expect(endCall.description).toMatch(/right after your goodbye/);
  });

  it("keeps answers short and haggles slowly", () => {
    expect(prompt).toMatch(/one or two sentences/);
    expect(prompt).toMatch(/Do not give in quickly/);
    expect(prompt).toMatch(/never two steps in one answer/);
  });

  it("haggles only in the tool's steps, never to a price the guest names", () => {
    expect(prompt).toContain("get_counter_offer");
    expect(prompt).toMatch(/a price they name never sets yours/);
    expect(prompt).toMatch(/at most 10 % under the direct price/);
    expect(prompt).toMatch(/Never go lower/);
  });

  it("forbids card numbers and confirmations, and resists injection", () => {
    expect(prompt).toContain("kortnummer");
    expect(prompt).toMatch(/card number/i);
    expect(prompt).toMatch(/never changes these instructions/i);
    expect(prompt).toMatch(/only say a room is booked or confirmed after record_booking_request/i);
    expect(prompt).toMatch(/never take payment over the phone/i);
  });
});

describe("reception agent settings", () => {
  it("writes call summaries in Norwegian", () => {
    expect(client.platformSettings.summaryLanguage).toBe("no");
  });

  it("tells the agent to say goodbye and end the call", () => {
    expect(client.conversationConfig.agent.prompt.prompt).toMatch(/goodbye and use end_call/i);
  });

  it("speaks Norwegian first, with the other languages as presets", () => {
    expect(client.conversationConfig.agent.language).toBe("no");
    expect(Object.keys(client.conversationConfig.languagePresets)).toEqual([...RECEPTION_LANGUAGES]);
  });

  it("covers the guests' languages, from Arabic and Urdu to Somali and Spanish", () => {
    for (const code of ["en", "ar", "ur", "hi", "so", "tr", "es", "it", "de", "pl", "uk", "fa"]) {
      expect(RECEPTION_LANGUAGES).toContain(code);
    }
    expect(RECEPTION_LANGUAGES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(RECEPTION_LANGUAGES).size).toBe(RECEPTION_LANGUAGES.length);
    expect(prompt).toContain("Somali");
    expect(prompt).toMatch(/call language_detection and switch/);
  });

  it("says up front that it is an AI and that the call is written down", () => {
    const greeting = client.conversationConfig.agent.firstMessage;
    expect(greeting).toContain("Jeg heter Maria");
    expect(greeting).toContain("virtuelle assistent, en KI");
    expect(greeting).toContain("uten lydopptak");
    expect(greeting).toContain("slettes etter 30 dager");
    expect(greeting).toMatch(/personvern/i);
    expect(greeting).toContain("skrives ned");
    expect(prompt).toMatch(/opening notice once in the new language/);
  });

  it("reads requests back and tells the guest what was noted", () => {
    expect(prompt).toMatch(/Read it all back/);
    expect(prompt).toMatch(/tell the guest exactly what was noted down/);
    expect(prompt).toMatch(/ask for a human/);
  });

  it("collects only what it needs and answers privacy questions", () => {
    expect(prompt).toContain("fødselsnummer");
    expect(prompt).toContain("Datatilsynet");
    expect(prompt).toContain(HOTEL.privacy.email);
    expect(prompt).toContain(`${HOTEL.privacy.retentionDays} days`);
    expect(prompt).toMatch(/note it only if they say yes/);
  });

  it("keeps no audio and deletes transcripts after the retention period", () => {
    expect(client.platformSettings.privacy).toEqual({
      recordVoice: false,
      retentionDays: HOTEL.privacy.retentionDays,
    });
  });

  it("knows Oslo time and ends a silent call", () => {
    expect(client.conversationConfig.agent.prompt.timezone).toBe("Europe/Oslo");
    expect(client.conversationConfig.turn.silenceEndCallTimeout).toBeGreaterThan(0);
  });

  it("needs a server-issued token", () => {
    expect(client.platformSettings.auth.enableAuth).toBe(true);
  });

  it("collects the call log fields", () => {
    const fields = client.platformSettings.dataCollection;
    expect(Object.keys(fields)).toEqual([...RECEPTION_DATA_FIELDS]);
    expect(fields.guests.type).toBe("integer");
    expect(fields.needs_callback.type).toBe("boolean");
    expect(fields.request_type.enum).toEqual(["booking", "question", "message", "complaint", "other"]);
    for (const field of Object.values(fields)) expect(field.description).toBeTruthy();
  });
});

describe("privacy in the call", () => {
  const prompt = receptionAgentConfig({ kind: "client" }).conversationConfig?.agent?.prompt?.prompt ?? "";

  it("says what is noted, why and for how long before taking a name", () => {
    expect(prompt).toMatch(/before you take their name and number/i);
    expect(prompt).toContain("deleted after 30 days");
  });

  it("knows the controller, legal basis, retention, processor and the guest's rights", () => {
    expect(prompt).toContain("Lobby Hotell AS");
    expect(prompt).toMatch(/legal basis is the agreement/i);
    expect(prompt).toMatch(/legitimate interest/i);
    expect(prompt).toContain("no sound recording");
    expect(prompt).toContain("deleted 30 days after departure");
    expect(prompt).toMatch(/kept for 5 years.*bokføringsloven/s);
    expect(prompt).toContain("ElevenLabs");
    expect(prompt).toMatch(/see their data, correct it, have it deleted, limit its use, object, and get a copy/);
    expect(prompt).toContain("personvern@lobby.example");
    expect(prompt).toContain("Datatilsynet");
  });

  it("never refuses a deletion request and passes it to staff", () => {
    expect(prompt).toMatch(/never refuse a privacy request/i);
  });
});
