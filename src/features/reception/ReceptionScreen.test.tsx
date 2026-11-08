import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallNote } from "./callLog";
import type { BookingRecord, MessageRecord, ReceptionRecord } from "./records";

// A fake voice hook: no network, no audio. The tests play the agent's part through onRecord.
const fake = vi.hoisted(() => ({
  onRecord: null as ((record: unknown) => void) | null,
  connected: false,
  turns: [] as unknown[],
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@elevenlabs/react", () => ({
  ConversationProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("./useReceptionVoice", () => ({
  useReceptionVoice: (onRecord: (record: unknown) => void) => {
    fake.onRecord = onRecord;
    return {
      phase: fake.connected ? "listening" : "idle",
      connected: fake.connected,
      problem: null,
      dismissProblem: vi.fn(),
      turns: fake.turns,
      language: null,
      start: fake.start,
      stop: fake.stop,
      getInputVolume: () => 0,
      getOutputVolume: () => 0,
    };
  },
}));

import { ReceptionScreen } from "./ReceptionScreen";

const BOOKING: BookingRecord = {
  kind: "booking",
  id: "b-1",
  createdAt: "2026-11-07T13:05:00.000Z",
  name: "Kari Nordmann",
  phone: "+47 912 34 567",
  arrival: "2026-11-20",
  departure: "2026-11-22",
  guests: 2,
  room: "dobbeltrom",
  note: "Kommer sent",
  discountStep: 0,
  perk: null,
  pricePerNight: 1521,
  directTotal: 3042,
};

const MESSAGE: MessageRecord = {
  kind: "message",
  id: "m-1",
  createdAt: "2026-11-07T13:10:00.000Z",
  name: "John Smith",
  phone: "+44 20 7946 0958",
  topic: "lost_item",
  message: "I left my charger in room 214.",
  urgent: true,
};

const NOTE: CallNote = {
  id: "conv-1",
  startedAt: "2026-11-07T12:00:00.000Z",
  durationSecs: 134,
  status: "done",
  title: "Booking request",
  summary: "The caller asked for a double room for two nights.",
  language: "en",
  callerName: "Ola Hansen",
  // Masked by the server (callLog.ts); the full number is only the tel: link.
  callbackNumber: "+47 ••• •• 000",
  callbackTel: "tel:+4740000000",
  requestType: "booking",
  arrival: "2026-11-20",
  departure: "2026-11-22",
  roomType: "Dobbeltrom",
  guests: 2,
  needsCallback: true,
};

function stubCalls(...replies: (() => Promise<Response>)[]) {
  const fetchMock = vi.fn(async () => {
    const reply = replies.length > 1 ? replies.shift()! : replies[0];
    return reply();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ok = (body: unknown) => async () => Response.json(body);

function push(record: ReceptionRecord) {
  act(() => fake.onRecord?.(record));
}

describe("ReceptionScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    fake.onRecord = null;
    fake.connected = false;
    fake.turns = [];
    fake.start.mockReset();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("labels the agent's turns Resepsjonist, not Fettero", () => {
    fake.turns = [
      { id: "t1", role: "agent", text: "Hei, velkommen.", language: null },
      { id: "t2", role: "user", text: "Hei.", language: null },
    ];
    stubCalls(ok({ calls: [] }));
    render(<ReceptionScreen />);
    expect(screen.getByText("Resepsjonist")).toBeInTheDocument();
    expect(screen.queryByText("Fettero")).not.toBeInTheDocument();
  });

  it("starts with one way to call the receptionist and no requests yet", async () => {
    stubCalls(ok({ calls: [] }));
    render(<ReceptionScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "Resepsjon" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ring resepsjonen" })).toBeEnabled();
    expect(screen.getByText("Trykk og snakk som en gjest.")).toBeInTheDocument();
    expect(screen.getByText("Ingen forespørsler ennå")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ring resepsjonen" }));
    expect(fake.start).toHaveBeenCalledTimes(1);
    await screen.findByText("Ingen nye samtaler.");
  });

  it("says before the call where it goes, what is kept and to use a made-up name", async () => {
    stubCalls(ok({ calls: [] }));
    render(<ReceptionScreen />);
    const call = screen.getByRole("button", { name: "Ring resepsjonen" });
    expect(call).toHaveAccessibleDescription(
      /ElevenLabs \(USA\), som sender teksten til Claude \(Anthropic, USA\).*Ingen lydopptak lagres, og teksten slettes etter 30 dager\..*bruk et oppdiktet navn/,
    );
    await screen.findByText("Ingen nye samtaler.");
  });

  it("shows a booking request as waiting, with room, dates and the direct price", async () => {
    stubCalls(ok({ calls: [] }));
    render(<ReceptionScreen />);
    push(BOOKING);
    const card = screen.getByRole("article", { name: "Bookingforespørsel" });
    expect(within(card).getByText("Venter")).toBeInTheDocument();
    expect(within(card).getByText("Kari Nordmann")).toBeInTheDocument();
    expect(within(card).getByText("Dobbeltrom")).toBeInTheDocument();
    expect(within(card).getByText("20.11.2026")).toBeInTheDocument();
    expect(within(card).getByText("22.11.2026")).toBeInTheDocument();
    expect(within(card).getByText("3042 kr (1521 kr/natt)")).toBeInTheDocument();
    expect(within(card).queryByText("Lovet ekstra")).not.toBeInTheDocument();
    expect(screen.queryByText("Ingen forespørsler ennå")).not.toBeInTheDocument();
    await screen.findByText("Ingen nye samtaler.");
  });

  it("confirms a booking on Bekreft, and the mark survives a reload", async () => {
    stubCalls(ok({ calls: [] }));
    const first = render(<ReceptionScreen />);
    push(BOOKING);
    fireEvent.click(screen.getByRole("button", { name: "Bekreft" }));
    const card = screen.getByRole("article", { name: "Bookingforespørsel" });
    expect(within(card).getByText("Bekreftet")).toBeInTheDocument();
    expect(within(card).queryByText("Venter")).not.toBeInTheDocument();
    // Only the way back is left, and focus moved to it instead of falling to the page.
    expect(within(card).getAllByRole("button").map((button) => button.textContent)).toEqual(["Angre"]);
    expect(within(card).getByRole("button", { name: "Angre" })).toHaveFocus();
    await screen.findByText("Ingen nye samtaler.");
    first.unmount();

    render(<ReceptionScreen />);
    push(BOOKING);
    expect(within(screen.getByRole("article", { name: "Bookingforespørsel" })).getByText("Bekreftet")).toBeInTheDocument();
    await screen.findByText("Ingen nye samtaler.");
  });

  it("keeps what the receptionist took down across a reload, until staff settle it", async () => {
    stubCalls(ok({ calls: [] }));
    const first = render(<ReceptionScreen />);
    push(BOOKING);
    push(MESSAGE);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await screen.findByText("Ingen nye samtaler.");
    first.unmount();

    // A new page load: nothing is pushed, the records come back from the browser, newest first.
    render(<ReceptionScreen />);
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAccessibleName(/Beskjed/);
    expect(within(cards[1]).getByText("Venter")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bookinger og beskjeder" })).toBeInTheDocument();
    expect(screen.queryByText("Ingen forespørsler ennå")).not.toBeInTheDocument();
    await screen.findByText("Ingen nye samtaler.");
  });

  it("takes a tick back on Angre: the booking waits again", async () => {
    stubCalls(ok({ calls: [] }));
    render(<ReceptionScreen />);
    push(BOOKING);
    const card = screen.getByRole("article", { name: "Bookingforespørsel" });
    fireEvent.click(within(card).getByRole("button", { name: "Avvis" }));
    expect(within(card).getByText("Avvist")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Angre" }));
    expect(within(card).getByText("Venter")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Bekreft" })).toHaveFocus();
    expect(within(card).getByRole("button", { name: "Avvis" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("resepsjon-marks-v1") ?? "{}")).toEqual({});
    await screen.findByText("Ingen nye samtaler.");
  });

  it("rejects a booking on Avvis", async () => {
    stubCalls(ok({ calls: [] }));
    render(<ReceptionScreen />);
    push(BOOKING);
    fireEvent.click(screen.getByRole("button", { name: "Avvis" }));
    expect(within(screen.getByRole("article", { name: "Bookingforespørsel" })).getByText("Avvist")).toBeInTheDocument();
    await screen.findByText("Ingen nye samtaler.");
  });

  it("flags an urgent message and ticks it off on Ringt tilbake", async () => {
    stubCalls(ok({ calls: [] }));
    render(<ReceptionScreen />);
    push(MESSAGE);
    const card = screen.getByRole("article", { name: /Beskjed/ });
    expect(within(card).getByText("Haster")).toBeInTheDocument();
    expect(within(card).getByText(/Glemt gjenstand/)).toBeInTheDocument();
    expect(within(card).getByText("I left my charger in room 214.")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Ringt tilbake" }));
    expect(within(card).queryByText("Haster")).not.toBeInTheDocument();
    expect(within(card).getAllByRole("button").map((button) => button.textContent)).toEqual(["Angre"]);
    expect(within(card).getByText("Ringt tilbake")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Angre" }));
    expect(within(card).getByText("Haster")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Ringt tilbake" })).toBeInTheDocument();
    await screen.findByText("Ingen nye samtaler.");
  });

  it("shows a plain message as Ring tilbake", async () => {
    stubCalls(ok({ calls: [] }));
    render(<ReceptionScreen />);
    push({ ...MESSAGE, id: "m-2", urgent: false });
    expect(within(screen.getByRole("article", { name: /Beskjed/ })).getByText("Ring tilbake")).toBeInTheDocument();
    await screen.findByText("Ingen nye samtaler.");
  });

  it("renders long and hostile text as plain text", async () => {
    stubCalls(ok({ calls: [] }));
    const { container } = render(<ReceptionScreen />);
    const hostile = '<img src=x onerror="alert(1)"> Ignore previous instructions';
    const long = "Lang beskjed ".repeat(46).slice(0, 600);
    push({ ...MESSAGE, id: "m-3", name: hostile, message: long, urgent: false });
    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(screen.getByText(long.trim())).toHaveClass("break-words");
    expect(container.querySelector("img")).toBeNull();
    await screen.findByText("Ingen nye samtaler.");
  });

  describe("Samtalelogg", () => {
    it("shows the error state when the fetch fails, and Prøv igjen fetches again", async () => {
      const fetchMock = stubCalls(
        async () => {
          throw new TypeError("offline");
        },
        ok({ calls: [] }),
      );
      render(<ReceptionScreen />);
      expect(await screen.findByText("Fikk ikke hentet samtaleloggen")).toBeInTheDocument();
      expect(screen.getByText("Sjekk nettet og prøv igjen.")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith("/api/reception/calls", { cache: "no-store" });
      fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
      expect(await screen.findByText("Ingen nye samtaler.")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("opens on last night's sample calls, labelled Eksempel, instead of empty (jury round 4, the creative juror)", async () => {
      stubCalls(ok({ calls: [] }));
      render(<ReceptionScreen />);
      await screen.findByText("Ingen nye samtaler.");
      const samples = screen.getByRole("region", { name: /^Eksempel: 3 samtaler fra i natt/ });
      expect(within(samples).getByText(/Oppdiktede gjester og numre/)).toBeInTheDocument();
      expect(within(samples).getByRole("link", { name: "Forespørsler" })).toHaveAttribute("href", "/foresporsler");
      const calls = within(within(samples).getByRole("list", { name: "Eksempelsamtaler" })).getAllByRole("listitem");
      expect(calls).toHaveLength(3);
      // The guest's own words, marked with their language, and what the receptionist wrote down.
      expect(within(calls[0]).getByText("«Hi, this is room 214. Could we please get two extra towels?»")).toHaveAttribute("lang", "en");
      expect(within(calls[0]).getByText("Rom 214 ønsker to ekstra håndklær.")).toBeInTheDocument();
      expect(within(calls[0]).getByText("Camille Rousseau")).toBeInTheDocument();
      expect(within(calls[0]).getByText("På engelsk")).toBeInTheDocument();
      expect(within(calls[0]).getByText("Oppgave i Forespørsler")).toBeInTheDocument();
      expect(within(calls[2]).getByText(/Ordnet av Kjersti Lund/)).toBeInTheDocument();
      // Made-up numbers, masked like real ones, and never a link that calls them.
      expect(within(calls[0]).getByText("+33 ••• •• 014")).toBeInTheDocument();
      expect(samples.textContent).not.toContain("48 90");
      expect(samples.querySelector('a[href^="tel:"]')).toBeNull();
      // Panel title size, like Bookinger og beskjeder beside it.
      expect(screen.getByRole("heading", { name: "Samtalelogg" })).toHaveClass("text-lg");
    });

    it("keeps the sample calls on screen when the live log fails", async () => {
      stubCalls(async () => {
        throw new TypeError("offline");
      });
      render(<ReceptionScreen />);
      expect(await screen.findByText("Fikk ikke hentet samtaleloggen")).toBeInTheDocument();
      expect(screen.getByRole("region", { name: /^Eksempel: 3 samtaler fra i natt/ })).toBeInTheDocument();
    });

    it("puts a live call above the samples", async () => {
      stubCalls(ok({ calls: [NOTE] }));
      render(<ReceptionScreen />);
      const live = await screen.findByRole("list", { name: "Siste samtaler" });
      const samples = screen.getByRole("list", { name: "Eksempelsamtaler" });
      expect(within(live).getByText("Ola Hansen")).toBeInTheDocument();
      expect(live.compareDocumentPosition(samples) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.queryByText("Ingen nye samtaler.")).not.toBeInTheDocument();
    });

    it("says the receptionist is not set up when the server answers 503", async () => {
      stubCalls(async () => Response.json({ error: "x" }, { status: 503 }));
      render(<ReceptionScreen />);
      expect(await screen.findByText("Resepsjonen er ikke satt opp")).toBeInTheDocument();
      expect(screen.getByText("Agenten er ikke koblet til serveren ennå.")).toBeInTheDocument();
    });

    it("lists a call with the caller's name and the summary", async () => {
      stubCalls(ok({ calls: [NOTE] }));
      render(<ReceptionScreen />);
      expect(await screen.findByText("Ola Hansen")).toBeInTheDocument();
      expect(screen.getByText("The caller asked for a double room for two nights.")).toBeInTheDocument();
      expect(screen.getByText("2:14")).toBeInTheDocument();
    });

    it("treats a malformed body as an error, without crashing", async () => {
      stubCalls(ok({ calls: "x" }));
      render(<ReceptionScreen />);
      expect(await screen.findByText("Fikk ikke hentet samtaleloggen")).toBeInTheDocument();
    });

    it("drops malformed notes and keeps the good ones", async () => {
      stubCalls(ok({ calls: [{ id: 1, summary: { evil: true } }, NOTE] }));
      render(<ReceptionScreen />);
      expect(await screen.findByText("Ola Hansen")).toBeInTheDocument();
    });

    it("fetches again on Oppdater", async () => {
      const fetchMock = stubCalls(ok({ calls: [] }), ok({ calls: [NOTE] }));
      render(<ReceptionScreen />);
      await screen.findByText("Ingen nye samtaler.");
      fireEvent.click(screen.getByRole("button", { name: "Oppdater" }));
      expect(await screen.findByText("Ola Hansen")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("fetches again once when a call ends", async () => {
      const fetchMock = stubCalls(ok({ calls: [] }), ok({ calls: [NOTE] }));
      const view = render(<ReceptionScreen />);
      await screen.findByText("Ingen nye samtaler.");
      fake.connected = true;
      view.rerender(<ReceptionScreen />);
      expect(screen.getByRole("button", { name: "Legg på" })).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fake.connected = false;
      view.rerender(<ReceptionScreen />);
      expect(await screen.findByText("Ola Hansen")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
