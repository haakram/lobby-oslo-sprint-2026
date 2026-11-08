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

  it("names only controls that exist on the screen, in every language (jury round 4, the Holio juror)", () => {
    // Ruter's tab, the Øyne card's field and the Øyne card's button: every «…» a guide names is one of these.
    const onScreen = new Set(["Plukkliste", "Plassering", "Vis vei"]);
    // A stat label that is not a button, a tick-off that does not exist, and the hotel's words.
    const gone = [/Beste rute/, /\bhak\b/i, /odhacz/i, /tick it off/i, /\brom eller\b/i, /lager 2/i, /storeroom 2/i, /magazynie 2/i, /складі 2/i];
    for (const { code } of GUIDE_LANGUAGES) {
      for (const { step, guide } of guidesIn(code)) {
        for (const text of guide.steps) {
          for (const [, name] of text.matchAll(/«([^»]+)»/g)) expect(onScreen, `${code} ${step}: «${name}»`).toContain(name);
          for (const pattern of gone) expect(text, `${code} ${step}`).not.toMatch(pattern);
        }
      }
    }
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
