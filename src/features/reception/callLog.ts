import { z } from "zod";
import { maskPhone, maskPhonesInText, telHref } from "./maskPhone";
import { scrubText } from "./scrub";

export type CallNote = {
  id: string;
  startedAt: string;
  durationSecs: number;
  status: string;
  title: string | null;
  summary: string | null;
  language: string | null;
  callerName: string | null;
  /** Masked for the screen: "+47 ••• •• 493" (maskPhone.ts). */
  callbackNumber: string | null;
  /** The tel: link that calls the guest back; never shown as text. */
  callbackTel: string | null;
  requestType: string | null;
  arrival: string | null;
  departure: string | null;
  roomType: string | null;
  guests: number | null;
  needsCallback: boolean;
};

const MAX_CALLS = 20;
const MAX_TEXT = 600;

// Only the fields we read; the SDK returns camelCase, data collection results keyed by field id.
const summarySchema = z.object({
  conversationId: z.string(),
  startTimeUnixSecs: z.number(),
  callDurationSecs: z.number(),
  status: z.string(),
  callSummaryTitle: z.string().nullish(),
  transcriptSummary: z.string().nullish(),
  mainLanguage: z.string().nullish(),
  dataCollectionResults: z.record(z.string(), z.unknown()).nullish(),
});

const text = (value: unknown) => (typeof value === "string" && value.trim() ? scrubText(value, MAX_TEXT) : null);
/** Free text a screen shows: any phone number in it is masked, wherever the note is read (Oversikt, Forespørsler, the bell). */
const shown = (value: unknown) => {
  const clean = text(value);
  return clean && maskPhonesInText(clean);
};

function field(results: Record<string, unknown> | null | undefined, id: string): unknown {
  const entry = results?.[id];
  // Either { value: X } (the API shape) or the plain value X.
  return entry && typeof entry === "object" && "value" in entry ? entry.value : entry;
}

/** Turns the ElevenLabs conversations list into staff-readable notes; malformed items are dropped. */
export function toCallNotes(raw: unknown): CallNote[] {
  const list = raw && typeof raw === "object" && "conversations" in raw ? raw.conversations : null;
  if (!Array.isArray(list)) return [];
  const notes: { at: number; note: CallNote }[] = [];
  for (const item of list) {
    const parsed = summarySchema.safeParse(item);
    if (!parsed.success) continue;
    const s = parsed.data;
    const data = s.dataCollectionResults;
    const guests = field(data, "guests");
    const callback = text(field(data, "callback_number"));
    notes.push({
      at: s.startTimeUnixSecs,
      note: {
        id: scrubText(s.conversationId, 100),
        startedAt: new Date(s.startTimeUnixSecs * 1000).toISOString(),
        durationSecs: s.callDurationSecs,
        status: scrubText(s.status, 40),
        title: shown(s.callSummaryTitle),
        summary: shown(field(data, "summary_no")) ?? shown(s.transcriptSummary),
        language: text(s.mainLanguage),
        callerName: shown(field(data, "caller_name")),
        callbackNumber: callback && maskPhone(callback),
        callbackTel: callback && telHref(callback),
        requestType: shown(field(data, "request_type")),
        arrival: text(field(data, "arrival_date")),
        departure: text(field(data, "departure_date")),
        roomType: shown(field(data, "room_type")),
        guests: typeof guests === "number" && Number.isFinite(guests) ? guests : null,
        needsCallback: field(data, "needs_callback") === true,
      },
    });
  }
  return notes
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_CALLS)
    .map(({ note }) => note);
}
