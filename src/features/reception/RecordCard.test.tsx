import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows staff the haggled price and the promised perk", () => {
    render(<RecordCard record={haggled} mark={undefined} onMark={vi.fn()} />);
    expect(screen.getByText("2738 kr (1369 kr/natt)")).toBeInTheDocument();
    expect(screen.getByText("Trinn 3 av prutestigen")).toBeInTheDocument();
    expect(screen.getByText("Sen utsjekk kl. 13:00")).toBeInTheDocument();
  });
  it("on a phone, masks the guest's number on screen and calls the full number back from the link", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: coarse)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container } = render(<RecordCard record={haggled} mark={undefined} onMark={vi.fn()} />);
    const link = screen.getByRole("link", { name: "Ring tilbake, nummeret slutter på 567" });
    expect(link).toHaveTextContent("+47 ••• •• 567");
    expect(link).toHaveAttribute("href", "tel:+4791234567");
    expect(container.textContent).not.toContain("912 34");
  });

  it("on a laptop, shows the masked number only: no link, and the full number nowhere in the page", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = render(<RecordCard record={haggled} mark={undefined} onMark={vi.fn()} />);
    expect(screen.queryByRole("link", { name: /Ring tilbake/ })).toBeNull();
    expect(screen.getByText("+47 ••• •• 567")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/tel:|91234567|912 34/);
  });
});
