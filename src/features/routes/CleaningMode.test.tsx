import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CleaningMode, type CleaningInitial } from "./CleaningMode";
import { BASE_HOTEL } from "@/features/hotel";
import type { HotelGraph } from "./hotelMap";
import type { NightLog } from "./useNightLog";

const LOG: NightLog = { status: "ready", lines: [], retry: () => {} };
const seed1 = BASE_HOTEL;

const initial = (rooms: string[], cart = true): CleaningInitial => ({ rooms, unknown: [], start: "laundry", cart });

/** Seed 1 without the elevator on floor 3: floor 3 is reached by the stairs only. */
const noLiftTo3: HotelGraph = {
  nodes: Object.fromEntries(Object.entries(seed1.nodes).filter(([id]) => id !== "elevator-3")),
  edges: seed1.edges.filter((e) => e.a !== "elevator-3" && e.b !== "elevator-3"),
};

/** Seed 1 plus a room 399 with no door to anywhere. */
const island: HotelGraph = { nodes: { ...seed1.nodes, "room-399": { id: "room-399", floor: 3, kind: "room" as const, x: 30, z: 30 } }, edges: seed1.edges };

describe("CleaningMode, no route", () => {
  it("says the room needs the stairs when the cart is the cause, and offers to switch the cart off", () => {
    render(<CleaningMode map={noLiftTo3} log={LOG} initial={initial(["room-201", "room-319"])} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Rom 319 kan bare nås via trapp");
    fireEvent.click(within(alert).getByRole("button", { name: "Slå av vogn" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Vogn" })).toHaveAttribute("aria-checked", "false");
    expect(within(screen.getByRole("list", { name: "Rekkefølge" })).getAllByRole("listitem")).toHaveLength(2);
  });

  it("does not blame the cart when there is no way at all, and offers to take the room out", () => {
    render(<CleaningMode map={island} log={LOG} initial={initial(["room-399", "room-201"], false)} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Kartet har ingen vei mellom Vaskeri og Rom 399");
    expect(alert).not.toHaveTextContent("vogn");
    expect(within(alert).queryByRole("button", { name: "Slå av vogn" })).not.toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Fjern rom 399" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Rekkefølge" })).getAllByRole("listitem")).toHaveLength(1);
  });
});
