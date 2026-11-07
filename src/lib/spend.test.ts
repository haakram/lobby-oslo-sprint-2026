import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { costUsd, createSpendMeter } from "./spend";

describe("costUsd", () => {
  it("prices input at $4 and output at $20 per million tokens", () => {
    expect(costUsd({ input_tokens: 1_000_000, output_tokens: 0 })).toBe(4);
    expect(costUsd({ input_tokens: 0, output_tokens: 1_000_000 })).toBe(20);
    expect(costUsd({ input_tokens: 500_000, output_tokens: 100_000 })).toBeCloseTo(4);
  });
});

describe("createSpendMeter", () => {
  it("allows spending until the limit is reached", () => {
    const meter = createSpendMeter(0.01);
    expect(meter.canSpend()).toBe(true);
    meter.record(0.004);
    expect(meter.canSpend()).toBe(true);
    meter.record(0.006);
    expect(meter.spentUsd()).toBeCloseTo(0.01);
    expect(meter.canSpend()).toBe(false);
  });
});
