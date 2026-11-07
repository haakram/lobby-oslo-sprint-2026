import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSpendMeter } from "@/lib/spend";
import { BudgetExceeded, IdentifyRefused, identifyProduct } from "./identify";

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

const found = (sku: string | null) => ({
  sku,
  name: "Sjampo",
  category: "hygiene",
  textSeen: ["Sjampo"],
  confidence: "high",
});

describe("identifyProduct", () => {
  it("maps a catalogue SKU to its product", async () => {
    const { client } = fakeClient({ parsed_output: found("FT-1001") });
    const result = await identifyProduct("AAAA", "image/jpeg", { client, meter: createSpendMeter(5) });
    expect(result.sku).toBe("FT-1001");
    expect(result.product?.sku).toBe("FT-1001");
    expect(result.textSeen).toEqual(["Sjampo"]);
  });

  it("drops an SKU that is not in the catalogue", async () => {
    const { client } = fakeClient({ parsed_output: found("FT-9999") });
    const result = await identifyProduct("AAAA", "image/png", { client, meter: createSpendMeter(5) });
    expect(result.sku).toBeNull();
    expect(result.product).toBeNull();
    expect(result.name).toBe("Sjampo");
  });

  it("throws IdentifyRefused on a refusal", async () => {
    const { client } = fakeClient({ stop_reason: "refusal" });
    await expect(
      identifyProduct("AAAA", "image/jpeg", { client, meter: createSpendMeter(5) }),
    ).rejects.toBeInstanceOf(IdentifyRefused);
  });

  it("records usage on the meter", async () => {
    const { client } = fakeClient({
      parsed_output: found("FT-1001"),
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    });
    const meter = createSpendMeter(50);
    await identifyProduct("AAAA", "image/jpeg", { client, meter });
    expect(meter.spentUsd()).toBe(4);
  });

  it("throws BudgetExceeded before calling the client", async () => {
    const { client, parse } = fakeClient({ parsed_output: found("FT-1001") });
    const meter = createSpendMeter(1);
    meter.record(1);
    await expect(identifyProduct("AAAA", "image/jpeg", { client, meter })).rejects.toBeInstanceOf(
      BudgetExceeded,
    );
    expect(parse).not.toHaveBeenCalled();
  });

  it("sends the image block, effort low and fallbacks", async () => {
    const { client, parse } = fakeClient({ parsed_output: found(null) });
    await identifyProduct("AAAA", "image/jpeg", { client, meter: createSpendMeter(5) });
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
