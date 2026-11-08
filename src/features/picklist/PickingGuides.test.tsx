import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GUIDE_STEPS, GUIDES } from "@/features/voice/guides";
import { GUIDE_LANGUAGES, guidesIn } from "./guides";
import { PickingGuides } from "./PickingGuides";

describe("the work guides in four languages", () => {
  it("has every guide in every language, step for step with the bokmål the voice agent uses", () => {
    for (const { code } of GUIDE_LANGUAGES) {
      const guides = guidesIn(code);
      expect(guides.map((entry) => entry.step)).toEqual([...GUIDE_STEPS]);
      for (const { step, guide } of guides) {
        expect(guide.steps, `${code} ${step}`).toHaveLength(GUIDES[step].steps.length);
        expect(guide.title.length).toBeGreaterThan(0);
      }
    }
    expect(guidesIn("nb")[1].guide).toBe(GUIDES.picking);
  });
});

describe("PickingGuides", () => {
  it("shows the four guides as cards, picking first, in bokmål by default", () => {
    render(<PickingGuides />);
    const section = screen.getByRole("region", { name: "Arbeidsguider" });
    const cards = within(section).getAllByRole("heading", { level: 3 });
    expect(cards.map((card) => card.textContent)).toEqual(["Plukking", "Varemottak", "Pakking", "Retur"]);
    expect(within(section).getByRole("button", { name: "Norsk" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches every card to Polish, Ukrainian or English, marked with its language", () => {
    render(<PickingGuides />);
    fireEvent.click(screen.getByRole("button", { name: "Polski" }));
    expect(screen.getByRole("heading", { name: "Kompletacja" })).toBeInTheDocument();
    expect(screen.getByText("Sprawdź SKU na półce, zanim weźmiesz towar.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kompletacja" }).closest("ul")).toHaveAttribute("lang", "pl");
    fireEvent.click(screen.getByRole("button", { name: "Українська" }));
    expect(screen.getByRole("heading", { name: "Комплектація" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Українська" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("heading", { name: "Picking" })).toBeInTheDocument();
    expect(screen.getByText("Oversatt av teamet, ennå ikke sjekket av noen med språket som morsmål.")).toBeInTheDocument();
  });
});
