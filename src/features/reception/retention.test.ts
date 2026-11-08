import { describe, expect, it } from "vitest";
import type { BookingRecord, MessageRecord } from "./records";
import { deleteOn, isExpired, RETENTION_DAYS } from "./retention";

const message = {
  kind: "message",
  id: "m1",
  createdAt: "2026-11-08T10:00:00.000Z",
  name: "Kari",
  phone: "+47 912 34 567",
  topic: "question",
  message: "Har dere parkering?",
  urgent: false,
} satisfies MessageRecord;

const booking = {
  kind: "booking",
  id: "b1",
  createdAt: "2026-11-08T10:00:00.000Z",
  name: "Ola",
  phone: "+47 912 34 567",
  arrival: "2026-12-20",
  departure: "2026-12-22",
  guests: 2,
  room: "dobbeltrom",
  note: "",
  discountStep: 0,
  perk: null,
  pricePerNight: 1521,
  directTotal: 3042,
  confirmed: true,
} satisfies BookingRecord;

describe("retention", () => {
  it("keeps call notes for 30 days, the same as the transcripts", () => {
    expect(RETENTION_DAYS).toBe(30);
  });

  it("deletes a message 30 days after the call", () => {
    expect(deleteOn(message)).toBe("2026-12-08");
    expect(isExpired(message, "2026-12-07")).toBe(false);
    expect(isExpired(message, "2026-12-08")).toBe(true);
  });

  it("keeps a booking until the stay is over, then 30 days after departure", () => {
    expect(deleteOn(booking)).toBe("2027-01-21");
    expect(isExpired(booking, "2026-12-31")).toBe(false);
    expect(isExpired(booking, "2027-01-21")).toBe(true);
  });

  it("treats a record with a broken date as expired", () => {
    expect(isExpired({ ...booking, departure: "snart" }, "2026-11-08")).toBe(true);
  });
});
