import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaintenanceScreen } from "./MaintenanceScreen";
import { splitNote } from "./select";

// One robot finding with the robot's own (English) words after the colon.
const NIGHT = [
  { v: 1, type: "start", shift: "w2-0000000000000000000000000000000b", mode: "practice", seed: 1, t: 1794058477 },
  { v: 1, type: "state", clock: "02:10:00", location: "lobby", score: 0 },
  {
    v: 1,
    type: "decision",
    kind: "work_order",
    data: { room: "room-206", place: null, type: "annet", text: "Romsjekk room-206: Nobody is here. The bed is unmade.", request: null },
  },
  { v: 1, type: "end", score: 10, requests_served: 0, reason: "server ended: time" },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(NIGHT, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function figure(label: string): string {
  return screen.getByText(label).previousElementSibling?.textContent ?? "";
}

describe("MaintenanceScreen (Vedlikehold)", () => {
  it("resolves a pre-assigned order with the first click on Marker løst", async () => {
    render(<MaintenanceScreen />);
    await screen.findByText(/Nobody is here/);
    expect(figure("Rom ute av drift")).toBe("2");
    // Rom 107 came in from staff with a name on it: it shows Tildelt, so the button is Marker løst.
    fireEvent.click(screen.getByRole("button", { name: "Marker løst: Teknisk, Rom 107" }));
    expect(screen.queryByRole("button", { name: "Marker løst: Teknisk, Rom 107" })).not.toBeInTheDocument();
    expect(figure("Rom ute av drift")).toBe("1");
  });

  it("says the order is resolved and gives Angre the focus, which reopens it", async () => {
    render(<MaintenanceScreen />);
    await screen.findByText(/Nobody is here/);
    fireEvent.click(screen.getByRole("button", { name: "Marker løst: Teknisk, Rom 107" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Rom 107 er markert løst og ligger under Løst.");
    const undo = within(status).getByRole("button", { name: "Angre: Rom 107" });
    expect(undo).toHaveFocus();
    fireEvent.click(undo);
    const back = screen.getByRole("button", { name: "Marker løst: Teknisk, Rom 107" });
    expect(back).toHaveFocus();
    expect(figure("Rom ute av drift")).toBe("2");
  });

  it("keeps the focus on the row when Tildel leaves it in place, and Angre takes the assignment back", async () => {
    render(<MaintenanceScreen />);
    await screen.findByText(/Nobody is here/);
    const assign = screen.getByRole("button", { name: /^Tildel: .*Rom 206$/ });
    assign.focus();
    fireEvent.click(assign);
    expect(screen.getByRole("status")).toHaveTextContent("Rom 206 er tildelt Trond.");
    expect(screen.getByRole("button", { name: /^Marker løst: .*Rom 206$/ })).toHaveFocus();
    fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Angre: Rom 206" }));
    expect(screen.getByRole("button", { name: /^Tildel: .*Rom 206$/ })).toBeInTheDocument();
  });

  it("quotes the robot's English words apart from the Norwegian", async () => {
    render(<MaintenanceScreen />);
    const quote = await screen.findByText("Nobody is here. The bed is unmade.");
    expect(quote.tagName).toBe("Q");
    expect(quote).toHaveAttribute("lang", "en");
  });
});

describe("splitNote", () => {
  it("splits off English, keeps Norwegian whole", () => {
    expect(splitNote("Romsjekk rom 206: Nobody is here.")).toEqual({ lead: "Romsjekk rom 206", quote: "Nobody is here." });
    expect(splitNote("Støyklage nær rom 322: ba rom 322 dempe seg")).toEqual({ lead: "Støyklage nær rom 322: ba rom 322 dempe seg", quote: null });
    expect(splitNote("Vått gulv ved corridor-1b")).toEqual({ lead: "Vått gulv ved corridor-1b", quote: null });
  });
});
