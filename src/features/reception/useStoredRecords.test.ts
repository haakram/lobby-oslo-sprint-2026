import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingRecord, MessageRecord } from "./records";
import { MAX_STORED_RECORDS, RECORDS_STORAGE, useStoredRecords } from "./useStoredRecords";

// The haggling fields from the receptionist PRs (#21, #22) ride along: stored records keep them.
const BOOKING = {
  kind: "booking",
  id: "b-1",
  createdAt: "2026-11-07T13:05:00.000Z",
  name: "Kari Nordmann",
  phone: "+47 912 34 567",
  arrival: "2026-11-20",
  departure: "2026-11-22",
  guests: 2,
  room: "dobbeltrom",
  note: "",
  discountStep: 0,
  perk: null,
  pricePerNight: 1521,
  directTotal: 3042,
} as BookingRecord;

const MESSAGE: MessageRecord = {
  kind: "message",
  id: "m-1",
  createdAt: "2026-11-07T13:10:00.000Z",
  name: "John Smith",
  phone: "+44 20 7946 0958",
  topic: "lost_item",
  message: "I left my charger in room 214.",
  urgent: true,
};

describe("useStoredRecords", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps records newest first and reads them back after a reload", () => {
    const first = renderHook(() => useStoredRecords());
    act(() => first.result.current.add(BOOKING));
    act(() => first.result.current.add(MESSAGE));
    expect(first.result.current.records.map((record) => record.id)).toEqual(["m-1", "b-1"]);
    first.unmount();

    const second = renderHook(() => useStoredRecords());
    expect(second.result.current.records).toEqual([MESSAGE, BOOKING]);
    expect(RECORDS_STORAGE).toBe("resepsjon-records-v1");
  });

  it("replaces a record with the same id instead of listing it twice", () => {
    const { result } = renderHook(() => useStoredRecords());
    act(() => result.current.add(BOOKING));
    act(() => result.current.add({ ...BOOKING, guests: 3 }));
    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0]).toMatchObject({ id: "b-1", guests: 3 });
  });

  it("keeps at most the newest MAX_STORED_RECORDS", () => {
    const { result } = renderHook(() => useStoredRecords());
    act(() => {
      for (let index = 0; index < MAX_STORED_RECORDS + 5; index += 1) result.current.add({ ...MESSAGE, id: `m-${index}` });
    });
    expect(result.current.records).toHaveLength(MAX_STORED_RECORDS);
    expect(result.current.records[0].id).toBe(`m-${MAX_STORED_RECORDS + 4}`);
  });

  it("drops stored junk and malformed records, and keeps the good ones", () => {
    localStorage.setItem(
      RECORDS_STORAGE,
      JSON.stringify([{ kind: "booking", id: "x", name: { evil: true } }, { kind: "other", id: "y" }, 7, MESSAGE]),
    );
    expect(renderHook(() => useStoredRecords()).result.current.records).toEqual([MESSAGE]);
  });

  it("treats broken JSON or a stored object as none", () => {
    localStorage.setItem(RECORDS_STORAGE, "{bad");
    const broken = renderHook(() => useStoredRecords());
    expect(broken.result.current.records).toEqual([]);
    broken.unmount();
    localStorage.setItem(RECORDS_STORAGE, JSON.stringify({ a: MESSAGE }));
    expect(renderHook(() => useStoredRecords()).result.current.records).toEqual([]);
  });

  it("still works in memory when localStorage throws on get and set", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useStoredRecords());
    expect(result.current.records).toEqual([]);
    act(() => result.current.add(BOOKING));
    expect(result.current.records).toEqual([BOOKING]);
  });
});
