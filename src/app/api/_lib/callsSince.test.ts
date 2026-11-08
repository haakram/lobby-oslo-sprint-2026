import { describe, expect, it } from "vitest";
import { parseCallsSince } from "./callsSince";

describe("parseCallsSince (RECEPTION_CALLS_SINCE)", () => {
  it("is no cut-off when blank or unset", () => {
    expect(parseCallsSince(undefined)).toEqual({ ok: true, unixSecs: null });
    expect(parseCallsSince("")).toEqual({ ok: true, unixSecs: null });
    expect(parseCallsSince("   ")).toEqual({ ok: true, unixSecs: null });
  });

  it("reads an ISO time with its offset as unix seconds", () => {
    // 05:30 in Oslo on 8 Nov is 04:30 UTC.
    expect(parseCallsSince("2026-11-08T05:30:00+01:00")).toEqual({ ok: true, unixSecs: Date.UTC(2026, 10, 8, 4, 30) / 1000 });
    expect(parseCallsSince(" 2026-11-08T04:30Z ")).toEqual({ ok: true, unixSecs: Date.UTC(2026, 10, 8, 4, 30) / 1000 });
  });

  it("refuses a time without an offset or anything that isn't a time, so a typo never shows every call", () => {
    for (const raw of ["2026-11-08T05:30:00", "2026-11-08", "i morgen", "1731040200", "2026-13-40T99:99:00Z"]) {
      expect(parseCallsSince(raw)).toEqual({ ok: false });
    }
  });
});
