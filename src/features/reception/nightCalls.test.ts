import { describe, expect, it } from "vitest";
import type { CallNote } from "./callLog";
import { demoCalls } from "./demoCalls";
import { nightCalls, sampleCallNote } from "./nightCalls";

const TODAY = "2026-11-08";

const live: CallNote = {
  id: "conv-1",
  startedAt: "2026-11-08T05:40:00.000Z",
  durationSecs: 60,
  status: "done",
  title: "Booking",
  summary: "Dobbeltrom 20.–22. november.",
  language: "no",
  callerName: "Ola Hansen",
  callbackNumber: "+47 ••• •• 000",
  callbackTel: "tel:+4740000000",
  requestType: "booking",
  arrival: "2026-11-20",
  departure: "2026-11-22",
  roomType: "Dobbeltrom",
  guests: 2,
  needsCallback: true,
};

describe("nightCalls", () => {
  it("with no live calls, is the night's sample calls: the same three Overlevering and Forespørsler count", () => {
    const night = nightCalls([], { today: TODAY });
    expect(night.live).toEqual([]);
    expect(night.samples.map((s) => s.call)).toEqual(demoCalls(TODAY));
    expect(night.total).toBe(demoCalls(TODAY).length);
    expect(night.total).toBe(3);
  });

  it("puts live calls first and counts them with the samples", () => {
    const night = nightCalls([live], { today: TODAY });
    expect(night.live).toEqual([live]);
    expect(night.samples).toHaveLength(3);
    expect(night.total).toBe(4);
  });

  it("counts a sample once if the call log ever returns it", () => {
    const first = demoCalls(TODAY)[0];
    const night = nightCalls([{ ...live, id: first.record.id }], { today: TODAY });
    expect(night.samples.map((s) => s.call.record.id)).not.toContain(first.record.id);
    expect(night.total).toBe(3);
  });

  it("takes Oversikt's smaller call summaries as they are", () => {
    const summary = { id: "conv-9", startedAt: live.startedAt, title: null, summary: null, callerName: null, requestType: null, arrival: null, departure: null, guests: null, needsCallback: false };
    expect(nightCalls([summary], { today: TODAY }).live[0]).toBe(summary);
  });
});

describe("sampleCallNote", () => {
  it("shows a sample like a call-log note: masked number, no tel: link, the guest's request as the summary", () => {
    const [call] = demoCalls(TODAY);
    const note = sampleCallNote(call);
    expect(note.callerName).toBe("Camille Rousseau");
    expect(note.callbackNumber).toBe("+33 ••• •• 014");
    expect(note.callbackTel).toBeNull();
    expect(JSON.stringify(note)).not.toContain("48 90");
    expect(note.summary).toBe("Rom 214 ønsker to ekstra håndklær.");
    expect(note.language).toBe("engelsk");
    expect(note.durationSecs).toBe(48);
    expect(note.needsCallback).toBe(false);
  });
});
