import { describe, expect, it } from "vitest";
import { toCallNotes } from "./callLog";

const item = (over: Record<string, unknown> = {}) => ({
  conversationId: "conv_1",
  startTimeUnixSecs: 1_700_000_000,
  callDurationSecs: 42,
  status: "done",
  callSummaryTitle: "Rombestilling",
  transcriptSummary: "Gjesten vil booke.",
  mainLanguage: "no",
  dataCollectionResults: {
    caller_name: { dataCollectionId: "caller_name", value: "Kari", rationale: "x" },
    callback_number: { value: "+47 22 33 44 55" },
    request_type: { value: "booking" },
    arrival_date: { value: "2026-12-01" },
    departure_date: { value: "2026-12-03" },
    room_type: { value: "dobbeltrom" },
    guests: { value: 2 },
    needs_callback: { value: true },
  },
  ...over,
});

describe("toCallNotes", () => {
  it("prefers the Norwegian summary and falls back to the transcript summary", () => {
    const withNo = item({
      dataCollectionResults: { summary_no: { value: "Gjesten ringte." } },
    });
    expect(toCallNotes({ conversations: [withNo] })[0].summary).toBe("Gjesten ringte.");
    expect(toCallNotes({ conversations: [item()] })[0].summary).toBe("Gjesten vil booke.");
  });

  it("accepts plain data-collection values as well as { value } objects", () => {
    const plain = item({
      dataCollectionResults: { caller_name: "Ola", guests: 3, needs_callback: true, summary_no: "Kort." },
    });
    const [note] = toCallNotes({ conversations: [plain] });
    expect(note).toMatchObject({ callerName: "Ola", guests: 3, needsCallback: true, summary: "Kort." });
  });

  it("returns [] for junk", () => {
    expect(toCallNotes(null)).toEqual([]);
    expect(toCallNotes({})).toEqual([]);
    expect(toCallNotes({ conversations: "x" })).toEqual([]);
  });

  it("maps a conversation summary", () => {
    const [note] = toCallNotes({ conversations: [item()] });
    expect(note).toEqual({
      id: "conv_1",
      startedAt: new Date(1_700_000_000_000).toISOString(),
      durationSecs: 42,
      status: "done",
      title: "Rombestilling",
      summary: "Gjesten vil booke.",
      language: "no",
      callerName: "Kari",
      callbackNumber: "+47 ••• •• 455",
      callbackTel: "tel:+4722334455",
      requestType: "booking",
      arrival: "2026-12-01",
      departure: "2026-12-03",
      roomType: "dobbeltrom",
      guests: 2,
      needsCallback: true,
    });
  });

  it("drops malformed items but keeps valid ones", () => {
    const notes = toCallNotes({ conversations: [item(), { conversationId: 5 }] });
    expect(notes).toHaveLength(1);
  });

  it("nulls data of the wrong type instead of throwing", () => {
    const [note] = toCallNotes({
      conversations: [item({ dataCollectionResults: { guests: { value: "many" }, needs_callback: { value: "yes" } } })],
    });
    expect(note.guests).toBeNull();
    expect(note.needsCallback).toBe(false);
    expect(note.callerName).toBeNull();
  });

  it("copes with missing data collection and summary", () => {
    const [note] = toCallNotes({ conversations: [item({ dataCollectionResults: undefined, transcriptSummary: undefined })] });
    expect(note.summary).toBeNull();
    expect(note.requestType).toBeNull();
  });

  it("bounds and scrubs text", () => {
    const [long] = toCallNotes({ conversations: [item({ transcriptSummary: "a".repeat(10_000) })] });
    expect(long.summary).toHaveLength(600);
    const [card] = toCallNotes({ conversations: [item({ transcriptSummary: "kort 4111 1111 1111 1111" })] });
    expect(card.summary).not.toContain("4111");
  });

  it("sorts newest first and keeps at most 20", () => {
    const many = Array.from({ length: 25 }, (_, i) => item({ conversationId: `c${i}`, startTimeUnixSecs: 1_700_000_000 + i }));
    const notes = toCallNotes({ conversations: many });
    expect(notes).toHaveLength(20);
    expect(notes[0].id).toBe("c24");
  });
  it("masks callers' phone numbers in every field a screen shows, and keeps the full one only as the tel: link", () => {
    const [note] = toCallNotes({
      conversations: [
        item({
          callSummaryTitle: "Tilbakeringing til 90000717",
          dataCollectionResults: {
            caller_name: { value: "Olav" },
            callback_number: { value: "90000717" },
            summary_no: { value: "Olav (90000717) vil ha ekstra håndklær på rom 214. Ring +47 900 00 493." },
          },
        }),
      ],
    });
    expect(note.callbackNumber).toBe("••• •• 717");
    expect(note.callbackTel).toBe("tel:90000717");
    expect(note.title).toBe("Tilbakeringing til ••• •• 717");
    expect(note.summary).toBe("Olav (••• •• 717) vil ha ekstra håndklær på rom 214. Ring +47 ••• •• 493.");
    const { callbackTel, ...shownOnScreen } = note;
    expect(callbackTel).toContain("90000717");
    expect(JSON.stringify(shownOnScreen)).not.toMatch(/9917|93434/);
  });
});
