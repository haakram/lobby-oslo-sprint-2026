import { osloToday } from "./dates";
import type { MessageRecord } from "./records";

/**
 * TODO(phase-3): remove when the phone line is live at the hotel. Three calls the AI receptionist took
 * last night, so Forespørsler shows a phone call becoming a task without anyone calling first. Made-up
 * guests and numbers, never real people. Each is the same `MessageRecord` the receptionist's
 * `record_message` tool leaves (records.ts), plus what the call log would add: the length, the language
 * and the guest's own words. Times are this morning's, in Oslo.
 */

export type DemoCall = {
  record: MessageRecord;
  durationSecs: number;
  /** The language the guest spoke, as staff say it. */
  language: string;
  /** What the guest said, word for word. */
  quote: string;
  quoteLang: "en" | "nb";
  /** Already settled in the night: who did it and when (HH:MM). */
  handled?: { who: string; at: string };
};

/** "2026-11-08" + "01:47" (Oslo) → the ISO instant. */
export function osloIso(day: string, clock: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = clock.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Oslo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(guess))
      .map((part) => [part.type, part.value]),
  );
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (shown - guess)).toISOString();
}

export function demoCalls(today: string = osloToday()): DemoCall[] {
  const message = (id: string, clock: string, fields: Omit<MessageRecord, "kind" | "id" | "createdAt">): MessageRecord => ({
    kind: "message",
    id: `demo-call-${id}`,
    createdAt: osloIso(today, clock),
    ...fields,
  });
  return [
    {
      record: message("1", "01:47", {
        name: "Camille Rousseau",
        phone: "+33 6 12 48 90 14",
        topic: "other",
        message: "Rom 214 ønsker to ekstra håndklær.",
        urgent: false,
      }),
      durationSecs: 48,
      language: "engelsk",
      quote: "Hi, this is room 214. Could we please get two extra towels?",
      quoteLang: "en",
    },
    {
      record: message("2", "02:14", {
        name: "Kristin Haugland",
        phone: "+47 900 00 305",
        topic: "complaint",
        message: "Radiatoren på rom 134 virker ikke, og det er kaldt på rommet. Barna sover der.",
        urgent: false,
      }),
      durationSecs: 71,
      language: "norsk",
      quote: "Hei, det er rom 134. Radiatoren virker ikke, og det begynner å bli kaldt her. Barna sover.",
      quoteLang: "nb",
    },
    {
      record: message("3", "04:32", {
        name: "Mehmet Yilmaz",
        phone: "+47 900 00 270",
        topic: "other",
        message: "Rom 330 ber om vekking kl. 06:30.",
        urgent: false,
      }),
      durationSecs: 29,
      language: "engelsk",
      quote: "Room 330 here. Can I get a wake-up call at six thirty?",
      quoteLang: "en",
      handled: { who: "Kjersti Lund", at: "04:35" },
    },
  ];
}
