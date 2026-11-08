import { describe, expect, it } from "vitest";
import { agentNote, lookText } from "./norsk";

describe("agentNote", () => {
  it.each([
    ["tray-205-13 x1 delivered to room-205", "Brett levert til rom 205"],
    ["toy-3 x1 delivered to room-311", "Leke levert til rom 311"],
    ["towel x2 delivered to room-308", "2 × håndkle levert til rom 308"],
    ["luggage-212-28 taken up to room-212", "Bagasje båret opp til rom 212"],
    ["asked room-206 to keep the noise down", "Ba rom 206 dempe støyen"],
    ["looked inside room-213: Nobody is here. The room is tidy.", "Så inn i rom 213: Ingen der. Rommet er ryddig."],
    ["wet-floor sign placed over the wet patch at corridor-3a", "Skilt for vått gulv satt ut i korridor 3A"],
    ["wet-floor sign moved from corridor-3d to the wet patch at corridor-3c", "Skilt for vått gulv flyttet fra korridor 3D til korridor 3C"],
    ["told room-204: breakfast starts at seven", "Ga beskjed til rom 204: frokosten starter klokken sju"],
    ["No phone-charger order from 203 on record tonight; nothing was ordered.", "Ingen bestilling av lader fra rom 203 i natt; ingenting å levere"],
    ["The pillow for 136 was already delivered under R-001; nothing more to bring.", "Pute til rom 136 er alt levert (R-001); ingenting mer å levere"],
    ["towel out of stock", "Tomt for håndkle"],
    ["placed wallet-3 x1 in room-213 but the score did not rise", "Levert, men ikke bekreftet"],
  ])("%s", (note, norsk) => {
    expect(agentNote(note)).toBe(norsk);
  });

  it("keeps a note no rule knows, and an empty one", () => {
    expect(agentNote("something new")).toBe("something new");
    expect(agentNote("")).toBe("");
  });
});

describe("lookText", () => {
  it("says who opened the door, in Norwegian", () => {
    expect(lookText("Ms Bakke opens the door of room-328.")).toBe("Ms Bakke åpnet døren.");
    expect(lookText("No answer.")).toBe("Ingen svarte.");
  });
});
