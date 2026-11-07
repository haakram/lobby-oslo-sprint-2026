import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PicklistProvider, usePicklist } from "./PicklistProvider";

function setup() {
  return renderHook(() => usePicklist(), { wrapper: PicklistProvider });
}

describe("usePicklist", () => {
  it("adds a SKU once, even when added twice", () => {
    const { result } = setup();
    act(() => result.current.add("FT-1001"));
    act(() => result.current.add("FT-1001"));
    expect(result.current.skus).toEqual(["FT-1001"]);
  });

  it("removes a SKU and keeps the order of the rest", () => {
    const { result } = setup();
    act(() => {
      result.current.add("FT-1001");
      result.current.add("FT-1002");
      result.current.add("FT-1003");
    });
    act(() => result.current.remove("FT-1002"));
    expect(result.current.skus).toEqual(["FT-1001", "FT-1003"]);
  });

  it("clears the list", () => {
    const { result } = setup();
    act(() => {
      result.current.add("FT-1001");
      result.current.add("FT-1002");
    });
    act(() => result.current.clear());
    expect(result.current.skus).toEqual([]);
  });

  it("throws outside the provider", () => {
    expect(() => renderHook(() => usePicklist())).toThrow(/PicklistProvider/);
  });
});
