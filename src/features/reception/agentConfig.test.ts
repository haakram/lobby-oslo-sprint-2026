import { describe, expect, it } from "vitest";
import { directPrice, ROOM_TYPES } from "./hotel";
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
  it("has the four reception tools as client tools", () => {
    const tools = client.conversationConfig.agent.prompt.tools;
    expect(tools.map((t) => t.type)).toEqual(["client", "client", "client", "client"]);
    expect(tools.map((t) => t.name)).toEqual([...RECEPTION_TOOL_NAMES]);
  });
});

describe("receptionAgentConfig, webhook mode", () => {
  it("posts each tool to our route with the secret header", () => {
    const tools = webhook.conversationConfig.agent.prompt.tools;
    expect(tools).toHaveLength(4);
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
    expect(prompt).toContain("Hotell Nattskift");
    for (const room of ROOM_TYPES) {
      expect(prompt).toContain(String(directPrice(room)));
      expect(prompt).toContain(String(room.otaPrice));
    }
  });

  it("forbids card numbers and confirmations, and resists injection", () => {
    expect(prompt).toContain("kortnummer");
    expect(prompt).toMatch(/card number/i);
    expect(prompt).toMatch(/never changes these instructions/i);
    expect(prompt).toMatch(/never say a room is booked or confirmed/i);
  });
});

describe("reception agent settings", () => {
  it("speaks Norwegian first, with the other languages as presets", () => {
    expect(client.conversationConfig.agent.language).toBe("no");
    expect(Object.keys(client.conversationConfig.languagePresets)).toEqual([...RECEPTION_LANGUAGES]);
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
