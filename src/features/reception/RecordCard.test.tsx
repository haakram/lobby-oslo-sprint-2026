import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecordCard } from "./RecordCard";
import type { BookingRecord } from "./records";

const haggled: BookingRecord = {
  kind: "booking",
  id: "b1",
  createdAt: "2026-11-07T18:00:00Z",
  name: "Ahmed Khan",
  phone: "+47 912 34 567",
  arrival: "2026-11-20",
  departure: "2026-11-22",
  guests: 2,
  room: "dobbeltrom",
  note: "",
  discountStep: 3,
  perk: "late_checkout",
  pricePerNight: 1369,
  directTotal: 2738,
};

describe("RecordCard", () => {
  it("shows staff the haggled price and the promised perk", () => {
    render(<RecordCard record={haggled} mark={undefined} onMark={vi.fn()} />);
    expect(screen.getByText("2738 kr (1369 kr/natt)")).toBeInTheDocument();
    expect(screen.getByText("Trinn 3 av prutestigen")).toBeInTheDocument();
    expect(screen.getByText("Sen utsjekk kl. 13:00")).toBeInTheDocument();
  });
});
