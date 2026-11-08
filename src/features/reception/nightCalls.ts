import type { CallNote } from "./callLog";
import { type DemoCall, demoCalls } from "./demoCalls";
import { maskPhone } from "./maskPhone";

/**
 * The night's calls, one source for every screen that shows or counts them (jury round 4, the creative juror:
 * Oversikt said "Ingen samtaler ennå" while Overlevering said "3 samtaler"). The live call log first,
 * newest first as the route sends it, then last night's sample calls: the same `demoCalls(today)`
 * Overlevering and Forespørsler count, marked as samples wherever they are shown.
 * TODO(phase-3): drop the samples when the phone line is live at the hotel (demoCalls.ts).
 */

/** A sample call as the call log shows it, with what the guest said and what came of it. */
export type SampleCall = { note: CallNote; call: DemoCall };

/** A seeded call in the call log's own shape. The number is made up: masked like a real one, never a tel: link. */
export function sampleCallNote(call: DemoCall): CallNote {
  const { record } = call;
  return {
    id: record.id,
    startedAt: record.createdAt,
    durationSecs: call.durationSecs,
    status: "done",
    title: null,
    summary: record.kind === "message" ? record.message : null,
    language: call.language,
    callerName: record.name,
    callbackNumber: record.phone ? maskPhone(record.phone) : null,
    callbackTel: null,
    requestType: null,
    arrival: null,
    departure: null,
    roomType: null,
    guests: null,
    needsCallback: false,
  };
}

export type NightCalls<T> = {
  /** Calls the receptionist really took, from the call log. */
  live: T[];
  /** Last night's sample calls, oldest first, as the night ran. */
  samples: SampleCall[];
  /** Everything the screens count: live and samples. */
  total: number;
};

/**
 * The calls to show for tonight. `live` is whatever the call log returned (any note with an id; Oversikt's
 * summaries fit as they are); a live call that carries a sample's id is the sample, counted once.
 */
export function nightCalls<T extends { id: string }>(
  live: readonly T[],
  { today, demo }: { today?: string; demo?: readonly DemoCall[] } = {},
): NightCalls<T> {
  const ids = new Set(live.map((note) => note.id));
  const samples = (demo ?? demoCalls(today))
    .filter((call) => !ids.has(call.record.id))
    .map((call) => ({ note: sampleCallNote(call), call }));
  return { live: [...live], samples, total: live.length + samples.length };
}
