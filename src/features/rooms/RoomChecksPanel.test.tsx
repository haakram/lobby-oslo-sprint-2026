import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { formatKroner } from "@/features/dashboard/format";
import { parseRunLog, type RunLine } from "@/features/nightshift/runlog";
import { PILOT_EVIDENCE, pmsLastNight, revenueLastNight, sellableValue, TEST_BOOKING_LABEL } from "./pms";
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
  it("leads with the money and shows each room with what the system says and what the robot found", () => {
    render(asDesk(<RoomChecksPanel lines={TEST_NIGHT} today={TODAY} />));
    // The money, first, and honest: a person confirms before it is sold, and it is gross revenue.
    expect(screen.getByText(`1 rom kan selges etter bekreftelse · ca. ${ONE_ROOM} kr`)).toBeInTheDocument();
    expect(
      screen.getByText(
        `Frigitt i dag: ingen ennå. Brutto romsinntekt: 1 × snittprisen i natt, ${plain(formatKroner(REVENUE.adr))} kr (testdata). Systemet holder rommet til resepsjonen registrerer at gjesten har reist, så uten romsjekken står det usolgt i natt. Ekstra inntekt for hotellet bare en natt det ellers ville blitt utsolgt. Til sammenligning solgte hotellene i Oslo 72 % av rommene i 2025, til snittpris 1 631 kr (SSB, tabell 14169).`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1 av 4 sjekkede rom stemmer med systemet.")).toBeInTheDocument();
    const sell = rowOf("311");
    expect(within(sell).getByText("Systemet: opptatt (Silje Mørk) til 9.11.")).toBeInTheDocument();
    expect(within(sell).getByText("kl. 03:14")).toBeInTheDocument();
    // The bookings are the team's test data, and a pilot gets the evidence without the robot opening a booked room.
    expect(within(sell).getByText(TEST_BOOKING_LABEL)).toBeInTheDocument();
    expect(within(sell).getByText(PILOT_EVIDENCE)).toBeInTheDocument();
    expect(within(rowOf("210")).getByText(/Ms Bakke åpnet/)).toBeInTheDocument();
    expect(within(rowOf("210")).getByText(TEST_BOOKING_LABEL)).toBeInTheDocument();
    // A check at 22:40 is not taken as proof the room is empty.
    expect(screen.getByText(/Teller ikke: rom 301 \(sjekket 22:40\)/)).toBeInTheDocument();
  });

  it("sells a room in two steps, never one tap: confirm with reception, then mark free to sell; each step stamps who, and Angre steps back", () => {
    const { unmount } = render(asDesk(<RoomChecksPanel lines={TEST_NIGHT} today={TODAY} />));
    expect(screen.queryByRole("button", { name: "Merk rom 311 som ledig for salg" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bekreft med resepsjonen: rom 311" }));
    let sell = rowOf("311");
    expect(within(sell).getByText("Bekreftet med resepsjonen")).toBeInTheDocument();
    expect(within(sell).getByText("Ana Pereira · nå")).toBeInTheDocument();
    // Confirmed is not sold: the headline still offers the room.
    expect(screen.getByText(`1 rom kan selges etter bekreftelse · ca. ${ONE_ROOM} kr`)).toBeInTheDocument();
    const release = within(sell).getByRole("button", { name: "Merk rom 311 som ledig for salg" });
    expect(release).toHaveFocus();

    fireEvent.click(release);
    sell = rowOf("311");
    expect(within(sell).getByText("Ledig for salg")).toBeInTheDocument();
    expect(screen.getByText(`1 rom frigitt for salg i dag · ca. ${ONE_ROOM} kr`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`^Frigitt i dag: 1 rom · ca. ${ONE_ROOM} kr\\.`))).toBeInTheDocument();
    expect(within(sell).getByRole("button", { name: "Angre: rom 311" })).toHaveFocus();
    unmount();

    // A reload keeps the mark; Angre goes back to the confirmation, not to nothing.
    render(asDesk(<RoomChecksPanel lines={TEST_NIGHT} today={TODAY} />));
    fireEvent.click(within(rowOf("311")).getByRole("button", { name: "Angre: rom 311" }));
    expect(within(rowOf("311")).getByText("Bekreftet med resepsjonen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Merk rom 311 som ledig for salg" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Angre bekreftelsen: rom 311" }));
    expect(screen.getByRole("button", { name: "Bekreft med resepsjonen: rom 311" })).toHaveFocus();
  });

  it("holds back a room the robot carried an arriving guest's bags into, as the catch it is, never for sale", () => {
    const bags: RunLine = { v: 1, type: "call", cmd: "place", args: { item: "luggage-311", where: "room-311" }, ok: true, clock: "05:16:33" };
    render(asDesk(<RoomChecksPanel lines={[...TEST_NIGHT.slice(0, -1), bags, ...TEST_NIGHT.slice(-1)]} today={TODAY} />));
    expect(screen.getByText("Ingen rom å selge i dag · 1 holdt tilbake")).toBeInTheDocument();
    const held = rowOf("311");
    expect(within(held).getByText("Bagasje levert 05:16 for dagens ankomst, men bookingen har gjest til 9.11. Dobbelt tildelt?")).toBeInTheDocument();
    // What the join did, not the robot (jury round 3, the Wybe engineer): Fettero held the room back.
    expect(within(held).getByText("Fettero holdt rommet tilbake")).toBeInTheDocument();
    expect(within(held).queryByText("Roboten stoppet salget")).not.toBeInTheDocument();
    expect(within(held).queryByRole("button")).not.toBeInTheDocument();
    expect(within(held).getByRole("link", { name: "Åpne Gjester" })).toHaveAttribute("href", "/gjester");
  });

  it("on the demo night: 213 a real sleeper, 209 held with three arrivals' bags, 212 and 304 flagged from the robot's own log", () => {
    const demo = parseRunLog(readFileSync(resolve(process.cwd(), "public/runs/demo.jsonl"), "utf8")).lines;
    render(asDesk(<RoomChecksPanel lines={demo} today={TODAY} />));
    expect(within(rowOf("213")).getByText("Systemet: opptatt i natt (Ola Nygård), skulle reist 7.11. Utsjekk ikke registrert.")).toBeInTheDocument();
    expect(within(rowOf("209")).getByText("Bagasje for 3 ankomster levert, sist 05:16, men bookingen har gjest til 9.11. Dobbelt tildelt?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Flere ankomster i samme rom 2" })).toBeInTheDocument();
    const crowded = rowOf("212");
    expect(within(crowded).getByText("Bagasje for 3 ankomster i natt (00:31, 01:58 og 04:43).")).toBeInTheDocument();
    expect(within(crowded).getByText("Ett rom tar én ankomst: sjekk med resepsjonen hvem som skal bo der.")).toBeInTheDocument();
    // From the robot's log alone: no test-data label on it.
    expect(within(crowded).queryByText(TEST_BOOKING_LABEL)).not.toBeInTheDocument();
    expect(within(rowOf("304")).getByText("Bagasje for 2 ankomster i natt (00:50 og 04:17).")).toBeInTheDocument();
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
