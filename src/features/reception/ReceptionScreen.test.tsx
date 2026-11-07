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
  callbackNumber: "+47 400 00 000",
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
    await screen.findByText("Ingen samtaler ennå");
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
    expect(within(card).getByText("3042 kr")).toBeInTheDocument();
    expect(screen.queryByText("Ingen forespørsler ennå")).not.toBeInTheDocument();
    await screen.findByText("Ingen samtaler ennå");
  });

  it("confirms a booking on Bekreft, and the mark survives a reload", async () => {
    stubCalls(ok({ calls: [] }));
    const first = render(<ReceptionScreen />);
    push(BOOKING);
    fireEvent.click(screen.getByRole("button", { name: "Bekreft" }));
    const card = screen.getByRole("article", { name: "Bookingforespørsel" });
    expect(within(card).getByText("Bekreftet")).toBeInTheDocument();
    expect(within(card).queryByText("Venter")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    await screen.findByText("Ingen samtaler ennå");
    first.unmount();

    render(<ReceptionScreen />);
    push(BOOKING);
    expect(within(screen.getByRole("article", { name: "Bookingforespørsel" })).getByText("Bekreftet")).toBeInTheDocument();
    await screen.findByText("Ingen samtaler ennå");
  });

  it("rejects a booking on Avvis", async () => {
    stubCalls(ok({ calls: [] }));
    render(<ReceptionScreen />);
    push(BOOKING);
    fireEvent.click(screen.getByRole("button", { name: "Avvis" }));
    expect(within(screen.getByRole("article", { name: "Bookingforespørsel" })).getByText("Avvist")).toBeInTheDocument();
    await screen.findByText("Ingen samtaler ennå");
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
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    expect(within(card).getByText("Ringt tilbake")).toBeInTheDocument();
    await screen.findByText("Ingen samtaler ennå");
  });

  it("shows a plain message as Ring tilbake", async () => {
    stubCalls(ok({ calls: [] }));
    render(<ReceptionScreen />);
    push({ ...MESSAGE, id: "m-2", urgent: false });
    expect(within(screen.getByRole("article", { name: /Beskjed/ })).getByText("Ring tilbake")).toBeInTheDocument();
    await screen.findByText("Ingen samtaler ennå");
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
    await screen.findByText("Ingen samtaler ennå");
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
      expect(await screen.findByText("Ingen samtaler ennå")).toBeInTheDocument();
      expect(screen.getByText("Samtaler fra nettleseren og telefonen vises her.")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
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
      await screen.findByText("Ingen samtaler ennå");
      fireEvent.click(screen.getByRole("button", { name: "Oppdater" }));
      expect(await screen.findByText("Ola Hansen")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("fetches again once when a call ends", async () => {
      const fetchMock = stubCalls(ok({ calls: [] }), ok({ calls: [NOTE] }));
      const view = render(<ReceptionScreen />);
      await screen.findByText("Ingen samtaler ennå");
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
