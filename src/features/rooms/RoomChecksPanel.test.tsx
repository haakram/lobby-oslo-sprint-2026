import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { formatKroner } from "@/features/dashboard/format";
import { pmsLastNight, revenueLastNight, sellableValue } from "./pms";
import { RoomChecksPanel } from "./RoomChecksPanel";
import { TEST_NIGHT } from "./testNight";

const TODAY = "2026-11-08";
const session = { user: { u: "resepsjon", name: "Ana Pereira", role: "receptionist" as const }, view: "receptionist" as const, effectiveRole: "receptionist" as const, exp: 0 };
const asDesk = (children: ReactNode) => <SessionProvider session={session}>{children}</SessionProvider>;
// What one sellable room is worth today: last night's average rate from the same booking system, to the hundred.
// Testing Library compares a string to the text with its spaces collapsed, so the kroner's no-break space reads as a space.
const plain = (text: string) => text.replace(/\s/g, " ");
const REVENUE = revenueLastNight(36, pmsLastNight(TODAY));
const ONE_ROOM = plain(formatKroner(sellableValue(1, REVENUE)));

function rowOf(room: string): HTMLElement {
  const row = screen.getByText(room, { selector: "span" }).closest("li");
  if (!row) throw new Error(`no row for ${room}`);
  return row;
}

beforeEach(() => localStorage.clear());

describe("RoomChecksPanel (Rom: the robot's room checks against the booking system)", () => {
  it("leads with the good news and shows each room with what the system says and what the robot found", () => {
    render(asDesk(<RoomChecksPanel lines={TEST_NIGHT} today={TODAY} />));
    // The money, first: the line a hotel buys.
    expect(screen.getByText(`1 rom kan selges i dag · ca. ${ONE_ROOM} kr`)).toBeInTheDocument();
    expect(screen.getByText(`Systemet trodde det var opptatt. Anslag: 1 × snittprisen i natt, ${plain(formatKroner(REVENUE.adr))} kr (testdata).`)).toBeInTheDocument();
    expect(screen.getByText("1 av 4 sjekkede rom stemmer med systemet.")).toBeInTheDocument();
    const sell = rowOf("311");
    expect(within(sell).getByText("(Silje Mørk)")).toBeInTheDocument();
    expect(within(sell).getByText("kl. 03:14")).toBeInTheDocument();
    expect(within(rowOf("210")).getByText(/Ms Bakke åpnet/)).toBeInTheDocument();
    // A check at 22:40 is not taken as proof the room is empty.
    expect(screen.getByText(/Teller ikke: rom 301 \(sjekket 22:40\)/)).toBeInTheDocument();
  });

  it("marks a room as free to sell with who and when, keeps it for the day, and Angre takes it back", () => {
    const { unmount } = render(asDesk(<RoomChecksPanel lines={TEST_NIGHT} today={TODAY} />));
    fireEvent.click(screen.getByRole("button", { name: "Merk rom 311 som ledig for salg" }));
    const sell = rowOf("311");
    expect(within(sell).getByText("Ledig for salg")).toBeInTheDocument();
    expect(within(sell).getByText(/· Ana Pereira/)).toBeInTheDocument();
    expect(screen.getByText(`Rommet er merket ledig for salg i dag · ca. ${ONE_ROOM} kr.`)).toBeInTheDocument();
    const undo = within(sell).getByRole("button", { name: "Angre: rom 311" });
    expect(undo).toHaveFocus();
    unmount();

    // A reload keeps the mark.
    render(asDesk(<RoomChecksPanel lines={TEST_NIGHT} today={TODAY} />));
    expect(within(rowOf("311")).getByText("Ledig for salg")).toBeInTheDocument();
    fireEvent.click(within(rowOf("311")).getByRole("button", { name: "Angre: rom 311" }));
    expect(screen.getByRole("button", { name: "Merk rom 311 som ledig for salg" })).toHaveFocus();
  });

  it("makes a task for reception for the guest the system doesn't have, with a way to Forespørsler", () => {
    render(asDesk(<RoomChecksPanel lines={TEST_NIGHT} today={TODAY} />));
    fireEvent.click(screen.getByRole("button", { name: "Lag oppgave for resepsjonen: rom 210" }));
    const row = rowOf("210");
    expect(within(row).getByText("Oppgave til resepsjonen")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Åpne Forespørsler" })).toHaveAttribute("href", "/foresporsler");
    expect(JSON.parse(localStorage.getItem("lobby:room-check-marks") ?? "{}")[TODAY]["room-210"].action).toBe("task");
  });

  it("says so calmly when everything agrees, when the robot checked nothing, and while the night loads", () => {
    const agrees = TEST_NIGHT.filter((line) => !(line.type === "decision" && line.kind === "room_status" && ["room-311", "room-210", "room-301"].includes(String(line.data?.room))));
    const { rerender } = render(asDesk(<RoomChecksPanel lines={agrees} today={TODAY} />));
    expect(screen.getByText(/Alt stemmer\. Roboten sjekket 1 rom i natt/)).toBeInTheDocument();

    rerender(asDesk(<RoomChecksPanel lines={TEST_NIGHT.filter((line) => line.type !== "decision")} today={TODAY} />));
    expect(screen.getByText("Roboten har ikke sjekket noen rom ennå")).toBeInTheDocument();

    rerender(asDesk(<RoomChecksPanel lines={null} today={TODAY} />));
    expect(screen.getByText("Henter robotens romsjekk")).toBeInTheDocument();
  });
});
