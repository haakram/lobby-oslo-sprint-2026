import { z } from "zod";
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
  callbackNumber: string | null;
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

function field(results: Record<string, unknown> | null | undefined, id: string): unknown {
  const entry = results?.[id];
  return entry && typeof entry === "object" && "value" in entry ? entry.value : undefined;
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
    notes.push({
      at: s.startTimeUnixSecs,
      note: {
        id: scrubText(s.conversationId, 100),
        startedAt: new Date(s.startTimeUnixSecs * 1000).toISOString(),
        durationSecs: s.callDurationSecs,
        status: scrubText(s.status, 40),
        title: text(s.callSummaryTitle),
        summary: text(s.transcriptSummary),
        language: text(s.mainLanguage),
        callerName: text(field(data, "caller_name")),
        callbackNumber: text(field(data, "callback_number")),
        requestType: text(field(data, "request_type")),
        arrival: text(field(data, "arrival_date")),
        departure: text(field(data, "departure_date")),
        roomType: text(field(data, "room_type")),
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
