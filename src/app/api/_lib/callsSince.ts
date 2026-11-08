/**
 * RECEPTION_CALLS_SINCE: the receptionist's call log starts here. Calls that began before it are never
 * read, so the team's test calls of an earlier day (real names, real numbers) can't reach a screen, the
 * bell or a projector, whether or not someone remembered to delete them at ElevenLabs.
 *
 * An ISO time with its offset, e.g. 2026-11-08T05:30:00+01:00 (an offset is required: a bare local time
 * would mean one thing on a laptop and another on Vercel, which runs in UTC). Blank = no cut-off.
 */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export type CallsSince = { ok: true; unixSecs: number | null } | { ok: false };

/** The cut-off in unix seconds, null for none; `ok: false` for a value that is not such a time (fail closed). */
export function parseCallsSince(raw: string | undefined): CallsSince {
  const value = raw?.trim();
  if (!value) return { ok: true, unixSecs: null };
  if (!ISO_WITH_OFFSET.test(value)) return { ok: false };
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? { ok: true, unixSecs: Math.floor(ms / 1000) } : { ok: false };
}
