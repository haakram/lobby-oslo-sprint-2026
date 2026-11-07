import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { serverEnv, voiceEnv } from "./env";

// Made-up test values, never real keys.
const ELEVEN = "test-eleven-value-123";
const AGENT = "test-agent-value-456";

describe("serverEnv", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-value-789");
    vi.stubEnv("ELEVENLABS_API_KEY", ELEVEN);
    vi.stubEnv("ELEVENLABS_AGENT_ID", AGENT);
    vi.stubEnv("APP_CLAUDE_BUDGET_USD", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the variables when they are set", () => {
    const env = serverEnv();
    expect(env.ELEVENLABS_AGENT_ID).toBe(AGENT);
    expect(env.APP_CLAUDE_BUDGET_USD).toBe(5);
  });

  it("names a missing ANTHROPIC_API_KEY without leaking other values", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    let message = "";
    try {
      serverEnv();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("ANTHROPIC_API_KEY");
    expect(message).not.toContain(ELEVEN);
    expect(message).not.toContain(AGENT);
  });

  it("treats an empty key as missing", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    expect(() => serverEnv()).toThrow(/ELEVENLABS_API_KEY/);
  });

  it("leaves the agent id undefined when unset", () => {
    vi.stubEnv("ELEVENLABS_AGENT_ID", undefined);
    expect(serverEnv().ELEVENLABS_AGENT_ID).toBeUndefined();
  });

  it("defaults the Claude budget to 5 USD when unset or blank", () => {
    expect(serverEnv().APP_CLAUDE_BUDGET_USD).toBe(5);
    vi.stubEnv("APP_CLAUDE_BUDGET_USD", "");
    expect(serverEnv().APP_CLAUDE_BUDGET_USD).toBe(5);
  });

  it("parses a numeric budget", () => {
    vi.stubEnv("APP_CLAUDE_BUDGET_USD", "2.5");
    expect(serverEnv().APP_CLAUDE_BUDGET_USD).toBe(2.5);
  });

  it("throws on a budget that is not a positive number", () => {
    vi.stubEnv("APP_CLAUDE_BUDGET_USD", "abc");
    expect(() => serverEnv()).toThrow(/APP_CLAUDE_BUDGET_USD/);
    vi.stubEnv("APP_CLAUDE_BUDGET_USD", "-1");
    expect(() => serverEnv()).toThrow(/APP_CLAUDE_BUDGET_USD/);
  });
});

describe("voiceEnv", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    vi.stubEnv("ELEVENLABS_API_KEY", ELEVEN);
    vi.stubEnv("ELEVENLABS_AGENT_ID", AGENT);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("needs only the ElevenLabs variables, not ANTHROPIC_API_KEY", () => {
    expect(voiceEnv()).toEqual({ ELEVENLABS_API_KEY: ELEVEN, ELEVENLABS_AGENT_ID: AGENT });
  });

  it("leaves the agent id undefined when unset", () => {
    vi.stubEnv("ELEVENLABS_AGENT_ID", " ");
    expect(voiceEnv().ELEVENLABS_AGENT_ID).toBeUndefined();
  });

  it("names a missing ELEVENLABS_API_KEY without leaking the agent id", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", undefined);
    expect(() => voiceEnv()).toThrow(/ELEVENLABS_API_KEY/);
    expect(() => voiceEnv()).not.toThrow(new RegExp(AGENT));
  });
});
