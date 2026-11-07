import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RECEPTION_AGENT_ID_DEFAULT, receptionEnv, serverEnv, voiceEnv } from "./env";

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

describe("receptionEnv", () => {
  // Made-up test values, never real keys.
  const RECEPTION_AGENT = "test-reception-agent-321";
  const SECRET = "test-secret-value-abcdefghijklmnop";

  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    vi.stubEnv("ELEVENLABS_API_KEY", ELEVEN);
    vi.stubEnv("ELEVENLABS_RECEPTION_AGENT_ID", RECEPTION_AGENT);
    vi.stubEnv("RECEPTION_PUBLIC_URL", undefined);
    vi.stubEnv("RECEPTION_TOOL_SECRET", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function errorText(): string {
    try {
      receptionEnv();
    } catch (error) {
      return (error as Error).message;
    }
    return "";
  }

  it("needs only the ElevenLabs key; the agent id defaults to the team's agent", () => {
    vi.stubEnv("ELEVENLABS_RECEPTION_AGENT_ID", "");
    expect(receptionEnv()).toEqual({
      ELEVENLABS_API_KEY: ELEVEN,
      ELEVENLABS_RECEPTION_AGENT_ID: RECEPTION_AGENT_ID_DEFAULT,
      RECEPTION_PUBLIC_URL: undefined,
      RECEPTION_TOOL_SECRET: undefined,
    });
  });

  it("names a missing ELEVENLABS_API_KEY", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", undefined);
    const message = errorText();
    expect(message).toContain("ELEVENLABS_API_KEY");
    expect(message).not.toContain(RECEPTION_AGENT);
  });

  it("requires an https public URL and drops a trailing slash", () => {
    vi.stubEnv("RECEPTION_PUBLIC_URL", "http://x.no");
    expect(errorText()).toContain("RECEPTION_PUBLIC_URL");
    vi.stubEnv("RECEPTION_PUBLIC_URL", "not a url");
    expect(errorText()).toContain("RECEPTION_PUBLIC_URL");
    vi.stubEnv("RECEPTION_PUBLIC_URL", "https://fettero.example/");
    expect(receptionEnv().RECEPTION_PUBLIC_URL).toBe("https://fettero.example");
  });

  it("requires a secret of at least 24 characters and never prints it", () => {
    const short = "short-secret-value-12";
    vi.stubEnv("RECEPTION_TOOL_SECRET", short);
    const message = errorText();
    expect(message).toContain("RECEPTION_TOOL_SECRET");
    expect(message).not.toContain(short);
    vi.stubEnv("RECEPTION_TOOL_SECRET", SECRET);
    expect(receptionEnv().RECEPTION_TOOL_SECRET).toBe(SECRET);
  });
});
