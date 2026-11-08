import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CleaningPlan } from "./cleaningPlan";
import { cleaningSavings, SavingBand } from "./SavingBand";

/** A plan with only the figures the band reads. */
function plan(overrides: Partial<CleaningPlan> = {}): CleaningPlan {
  return {
    matrix: {} as CleaningPlan["matrix"],
    tour: { order: ["room-101", "room-201", "room-301"], metres: 260, seconds: 420, path: [] },
    legs: [],
    givenMetres: 286,
    givenSeconds: 600,
    givenRides: 6,
    saved: { metres: 26, percent: 9 },
    numberMetres: 300,
    savedOnNumbers: { metres: 40, percent: 13 },
    elevatorRides: 3,
    ...overrides,
  };
}

describe("SavingBand", () => {
  it("leads with metres against room-number order, never with time, and names that baseline", () => {
    render(<SavingBand plan={plan()} given="Mot rekkefølgen rommene blir ledige i" givenNote="Beste rute ser bort fra når rommene blir ledige." />);
    const band = screen.getByRole("region", { name: "Rutetall" });
    expect(band).toHaveTextContent("40 m spart · 13 % kortereenn de samme rommene i romnummer-rekkefølge");
    expect(band).not.toHaveTextContent(/min spart/);
    expect(band).toHaveTextContent("Mot romnummer-rekkefølge:300 m, beste rute er 40 m kortere (13 %)");
    expect(band).toHaveTextContent("Mot rekkefølgen rommene blir ledige i:286 m, beste rute er 26 m kortere (9 %) og har 3 heisturer færre");
    expect(band).toHaveTextContent("Beste rute ser bort fra når rommene blir ledige.");
  });

  it("says 'like kort' and leads with the round itself when room-number order is as short", () => {
    render(<SavingBand plan={plan({ numberMetres: 260, savedOnNumbers: { metres: 0, percent: 0 } })} />);
    const band = screen.getByRole("region", { name: "Rutetall" });
    expect(band).toHaveTextContent("260 m · ca. 7 min for 3 rom");
    expect(band).toHaveTextContent("Mot romnummer-rekkefølge:260 m, beste rute er like kort");
  });

  it("compares nothing for one or two rooms", () => {
    const two = plan({ tour: { order: ["room-101", "room-201"], metres: 120, seconds: 200, path: [] } });
    expect(cleaningSavings(two)).toMatchObject({ lead: "none", comparable: false });
    render(<SavingBand plan={two} />);
    expect(screen.getByRole("region", { name: "Rutetall" })).toHaveTextContent("Korteste runde på tvers av etasjene.");
  });
});
