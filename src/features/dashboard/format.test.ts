import { describe, expect, it } from "vitest";
import { nightLabel } from "./format";

describe("nightLabel: the night is named after the morning it hands over to", () => {
  it("a start after midnight is that same morning: the demo night (Sun 8 Nov 01:07) is the night to Sunday", () => {
    // public/runs/demo.jsonl, the start line: 2026-11-08 00:07:02 UTC = 01:07 in Oslo.
    expect(nightLabel(1794096422)).toBe("Natt til søndag 8. november");
  });

  it("a start in the evening hands over to the next morning", () => {
    // 2026-11-07 21:00 UTC = Sat 7 Nov 22:00 in Oslo.
    expect(nightLabel(1794085200)).toBe("Natt til søndag 8. november");
  });

  it("noon is the turning point: 11:59 is that morning, 12:00 the next", () => {
    // 2026-11-08 10:59 UTC = 11:59 Oslo; 11:00 UTC = 12:00 Oslo.
    expect(nightLabel(1794135540)).toBe("Natt til søndag 8. november");
    expect(nightLabel(1794135600)).toBe("Natt til mandag 9. november");
  });

  it("no start line, no label", () => {
    expect(nightLabel(null)).toBeNull();
    expect(nightLabel(Number.NaN)).toBeNull();
  });
});
