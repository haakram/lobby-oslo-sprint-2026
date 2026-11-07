const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD as the Norwegian 20.11.2026; anything else is shown as it came. */
export function formatDate(date: string): string {
  const m = ISO_DATE.exec(date);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : date;
}

const OSLO_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Oslo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function osloParts(iso: string): Record<string, string> | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return Object.fromEntries(OSLO_CLOCK.formatToParts(at).map((p) => [p.type, p.value]));
}

/** The Oslo clock time of an ISO timestamp, 14:05; empty when it is not a time. */
export function formatClock(iso: string): string {
  const p = osloParts(iso);
  return p ? `${p.hour}:${p.minute}` : "";
}

/** Day and Oslo clock time of an ISO timestamp, 07.11 14:05; empty when it is not a time. */
export function formatDayClock(iso: string): string {
  const p = osloParts(iso);
  return p ? `${p.day}.${p.month} ${p.hour}:${p.minute}` : "";
}

/** A call length in seconds as 2:14. */
export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
