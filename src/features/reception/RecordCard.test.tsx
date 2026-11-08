import { fireEvent, render, screen } from "@testing-library/react";
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
  confirmed: true,
};

describe("RecordCard", () => {
  it("shows staff the haggled price and the promised perk", () => {
    render(<RecordCard record={haggled} mark={undefined} onMark={vi.fn()} />);
    expect(screen.getByText("2738 kr (1369 kr/natt)")).toBeInTheDocument();
    expect(screen.getByText("Trinn 3 av prutestigen")).toBeInTheDocument();
    expect(screen.getByText("Sen utsjekk kl. 13:00")).toBeInTheDocument();
  });

  it("shows a booking Maria confirmed, which staff can still cancel", () => {
    const onMark = vi.fn();
    render(<RecordCard record={haggled} mark={undefined} onMark={onMark} />);
    expect(screen.getByRole("article", { name: "Booking" })).toBeInTheDocument();
    expect(screen.getByText("Bekreftet av Maria")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Avbestill" }));
    expect(onMark).toHaveBeenCalledWith("avvist");
  });

  it("shows a cancelled confirmed booking as Avbestilt", () => {
    render(<RecordCard record={haggled} mark="avvist" onMark={vi.fn()} />);
    expect(screen.getByText("Avbestilt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Angre" })).toBeInTheDocument();
  });

  it("shows an older booking without Maria's confirmation as waiting", () => {
    render(<RecordCard record={{ ...haggled, confirmed: false }} mark={undefined} onMark={vi.fn()} />);
    expect(screen.getByRole("article", { name: "Bookingforespørsel" })).toBeInTheDocument();
    expect(screen.getByText("Venter")).toBeInTheDocument();
  });
});
