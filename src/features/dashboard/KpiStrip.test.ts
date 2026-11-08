import { describe, expect, it } from "vitest";
import { COLUMNS } from "./KpiStrip";

describe("the figure row's columns", () => {
  it("never leaves one figure alone on a line from tablet width up (a phone's two columns may end on one)", () => {
    for (let count = 2; count <= 6; count += 1) {
      const wide = [...COLUMNS[count].matchAll(/@min-\[\d+rem\]:grid-cols-(\d)/g)].map((match) => Number(match[1]));
      for (const perLine of wide) expect(count % perLine, `${count} figures in ${perLine} columns`).not.toBe(1);
    }
    expect(COLUMNS[4]).not.toContain("grid-cols-3");
  });

  it("sizes by the row's own width (a container query), so the rail beside it can't break four into 3 + 1", () => {
    expect(COLUMNS[4]).toBe("grid-cols-2 @min-[44rem]:grid-cols-4");
  });
});
