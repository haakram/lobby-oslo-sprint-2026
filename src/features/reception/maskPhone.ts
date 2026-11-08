/**
 * Callers' phone numbers, masked wherever a screen shows them: "+47 ••• •• 493". The last three digits
 * are what a receptionist reads back to a guest; the rest never reaches a screen or a projector. Used where
 * the reception data is mapped (callLog.ts for the call log, which Oversikt, Forespørsler and the bell read)
 * and on Resepsjon's own cards. Calling back uses `telHref`, never the visible text.
 */

const HIDDEN = "••• ••";
/** A number written with a country code: "+47 …", "+33 …" (the code is the first group). */
const COUNTRY_CODE = /^\s*(\+\d{1,3})[\s-]/;
/** 8 to 12 digits, optionally after a country code, with single spaces between groups. Card-length runs are scrubbed before this. */
const PHONE_IN_TEXT = /(?<![\d+])(?:\+\d{1,3} ?)?\d(?: ?\d){7,11}(?!\d)/g;

/** "+47 900 00 493" → "+47 ••• •• 493"; "90000717" → "••• •• 717". Text with fewer than 8 digits is not a phone number and is left as it is. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return phone;
  const code = COUNTRY_CODE.exec(phone)?.[1];
  return `${code ? `${code} ` : ""}${HIDDEN} ${digits.slice(-3)}`;
}

/** Every phone number inside free text (a call summary), masked; everything else unchanged. */
export function maskPhonesInText(text: string): string {
  return text.replace(PHONE_IN_TEXT, (match) => maskPhone(match));
}

/** The tel: link that calls the number back, or null when it isn't one. Digits and a leading + only. */
export function telHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
