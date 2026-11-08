import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSpendMeter } from "@/lib/spend";
import { BudgetExceeded } from "./identify";
import { SceneRefused, describeScene } from "./scene";

type Reply = {
  stop_reason?: string;
  parsed_output?: unknown;
  usage?: { input_tokens: number; output_tokens: number };
};

function fakeClient(reply: Reply) {
  const parse = vi.fn(async (params: unknown) => ({
    params,
    stop_reason: "end_turn",
    parsed_output: null,
    usage: { input_tokens: 1000, output_tokens: 100 },
    ...reply,
  }));
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

const meter = () => createSpendMeter(5);

describe("describeScene", () => {
  it("returns cleaned landmarks: allowlisted, clamped, at most six", async () => {
    const { client } = fakeClient({
      parsed_output: {
        landmarks: [
          { label: "Dør", x: 0.1, y: 0.1, w: 0.2, h: 0.6 },
          { label: "Romskip", x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
          { label: "Heis", x: 0.75, y: -0.25, w: 0.5, h: 0.75 },
        ],
        things: [],
      },
    });
    const { landmarks } = await describeScene("AAAA", "image/jpeg", { client, meter: meter() });
    expect(landmarks).toEqual([
      { label: "Dør", x: 0.1, y: 0.1, w: 0.2, h: 0.6 },
      { label: "Heis", x: 0.75, y: 0, w: 0.25, h: 0.5 },
    ]);
  });

  it("returns cleaned things beside the landmarks, never a person", async () => {
    const { client } = fakeClient({
      parsed_output: {
        landmarks: [],
        things: [
          { name: "Caps", category: "other", kind: "guest", x: 0.4, y: 0.1, w: 0.2, h: 0.1 },
          { name: "Person", category: "other", kind: "person", x: 0.3, y: 0.1, w: 0.4, h: 0.9 },
        ],
      },
    });
    const { things } = await describeScene("AAAA", "image/jpeg", { client, meter: meter() });
    expect(things).toEqual([{ name: "Caps", category: "other", kind: "guest", x: 0.4, y: 0.1, w: 0.2, h: 0.1 }]);
  });

  it("asks to leave out what people wear or hold when people are off, in the user turn", async () => {
    const { client, parse } = fakeClient({ parsed_output: { landmarks: [], things: [] } });
    await describeScene("AAAA", "image/jpeg", { client, meter: meter() }, false);
    await describeScene("AAAA", "image/jpeg", { client, meter: meter() });
    type Params = { system: { text: string }[]; messages: { content: { type: string; text?: string }[] }[] };
    const [off, on] = parse.mock.calls.map(([params]) => params as Params);
    expect(off.messages[0].content[1].text).toMatch(/Leave out everything a person wears or holds/);
    expect(on.messages[0].content[1].text).not.toMatch(/Leave out/);
    // The system prompt is the same both ways, so the prompt cache holds.
    expect(off.system[0].text).toBe(on.system[0].text);
  });

  it("throws SceneRefused on a refusal", async () => {
    const { client } = fakeClient({ stop_reason: "refusal" });
    await expect(describeScene("AAAA", "image/jpeg", { client, meter: meter() })).rejects.toBeInstanceOf(
      SceneRefused,
    );
  });

  it("throws when the model returns no structured output", async () => {
    const { client } = fakeClient({ parsed_output: null });
    await expect(describeScene("AAAA", "image/jpeg", { client, meter: meter() })).rejects.toThrow(
      /no structured answer/,
    );
  });

  it("records usage on the shared meter, and stops before the cap", async () => {
    const { client, parse } = fakeClient({
      parsed_output: { landmarks: [], things: [] },
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    });
    const capped = createSpendMeter(4);
    await describeScene("AAAA", "image/png", { client, meter: capped });
    expect(capped.spentUsd()).toBe(4);
    await expect(describeScene("AAAA", "image/png", { client, meter: capped })).rejects.toBeInstanceOf(
      BudgetExceeded,
    );
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("sends the image with effort low and fallbacks", async () => {
    const { client, parse } = fakeClient({ parsed_output: { landmarks: [], things: [] } });
    await describeScene("AAAA", "image/jpeg", { client, meter: meter() });
    const params = parse.mock.calls[0][0] as {
      model: string;
      fallbacks: string;
      betas: string[];
      output_config: { effort: string };
      messages: { content: { type: string }[] }[];
    };
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config.effort).toBe("low");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toContain("server-side-fallback-2026-07-01");
    expect(params.messages[0].content[0].type).toBe("image");
  });
});
