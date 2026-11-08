import { addDays } from "./dates";
import { HOTEL } from "./hotel";
import type { ReceptionRecord } from "./records";

/** Days a call's notes are kept here (GDPR art. 5(1)(e), storage limitation): the same as the call transcripts. */
export const RETENTION_DAYS = HOTEL.privacy.retentionDays;

/**
 * The first day a record is gone, YYYY-MM-DD (Oslo dates). A message goes RETENTION_DAYS after the call.
 * A booking is needed until the stay is over, so it goes RETENTION_DAYS after departure; the receipt the
 * hotel must keep for the accounts (bokføringsloven) lives in the booking system, not here.
 */
export function deleteOn(record: ReceptionRecord): string {
  const from = record.kind === "booking" ? record.departure : record.createdAt.slice(0, 10);
  try {
    return addDays(from, RETENTION_DAYS);
  } catch {
    return ""; // Not a date: isExpired drops it.
  }
}

/** True once a record has passed its deletion day; a record with a broken date counts as expired. */
export function isExpired(record: ReceptionRecord, today: string): boolean {
  const day = deleteOn(record);
  return !/^\d{4}-\d{2}-\d{2}$/.test(day) || today >= day;
}
