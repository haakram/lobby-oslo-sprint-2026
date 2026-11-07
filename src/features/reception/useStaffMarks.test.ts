import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFF_MARKS_STORAGE, useStaffMarks } from "./useStaffMarks";

describe("useStaffMarks", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores a mark and reads it back in a new render", () => {
    const first = renderHook(() => useStaffMarks());
    act(() => first.result.current.mark("b-1", "bekreftet"));
    expect(first.result.current.marks).toEqual({ "b-1": "bekreftet" });
    first.unmount();

    const second = renderHook(() => useStaffMarks());
    expect(second.result.current.marks).toEqual({ "b-1": "bekreftet" });
    expect(STAFF_MARKS_STORAGE).toBe("resepsjon-marks-v1");
  });

  it("still works in memory when localStorage throws on get and set", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useStaffMarks());
    expect(result.current.marks).toEqual({});
    act(() => result.current.mark("m-1", "ringt"));
    expect(result.current.marks).toEqual({ "m-1": "ringt" });
  });

  it("ignores stored junk", () => {
    localStorage.setItem(STAFF_MARKS_STORAGE, "{bad");
    expect(renderHook(() => useStaffMarks()).result.current.marks).toEqual({});
  });

  it("keeps only known marks from a stored object", () => {
    localStorage.setItem(
      STAFF_MARKS_STORAGE,
      JSON.stringify({ a: "avvist", b: "slettet", c: 3, d: { x: 1 } }),
    );
    expect(renderHook(() => useStaffMarks()).result.current.marks).toEqual({ a: "avvist" });
  });

  it("treats a stored array or null as empty", () => {
    localStorage.setItem(STAFF_MARKS_STORAGE, JSON.stringify(["bekreftet"]));
    expect(renderHook(() => useStaffMarks()).result.current.marks).toEqual({});
    localStorage.setItem(STAFF_MARKS_STORAGE, "null");
    expect(renderHook(() => useStaffMarks()).result.current.marks).toEqual({});
  });
});
