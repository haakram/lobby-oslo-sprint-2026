export const CARD_REDACTED = "[kortnummer fjernet]";

const CARD_RUN = /\d(?:[ -]?\d){12,18}/g;

/** Cleans free text from a guest: no control characters, no card numbers, bounded length. */
export function scrubText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  const text = value
    .replace(/[\t\n\r]/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(CARD_RUN, CARD_REDACTED);
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (!/^[0-9+\-() ]+$/.test(text)) return null;
  if (text.lastIndexOf("+") > 0 || (text.match(/\+/g) ?? []).length > 1) return null;
  const digits = text.replace(/\D/g, "").length;
  return digits >= 8 && digits <= 15 ? text : null;
}
