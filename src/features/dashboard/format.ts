const NIGHT_DAY = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo",
  weekday: "long",
  day: "numeric",
  month: "long",
});

const OSLO_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", hourCycle: "h23" });

/**
 * "Natt til søndag 8. november": the shift runs 22:00 to 06:00, so it is named after the morning it
 * hands over to. The run log has no sim date; the start line's wall-clock time stands in for it. A
 * start before noon (Oslo) already is that morning (the demo night was recorded Sun 8 Nov 01:07, so
 * it is the night to Sunday); a start at noon or later hands over to the next morning.
 */
export function nightLabel(startedAt: number | null): string | null {
  if (startedAt === null || !Number.isFinite(startedAt)) return null;
  const hour = Number(OSLO_HOUR.format(new Date(startedAt * 1000)));
  const morning = new Date((startedAt + (hour < 12 ? 0 : 24 * 60 * 60)) * 1000);
  return `Natt til ${NIGHT_DAY.format(morning)}`;
}

/** "05:58:07" → "05:58". */
export function hhmm(clock: string | null | undefined): string {
  return clock ? clock.slice(0, 5) : "--:--";
}

/** 89.4 → "89 %". */
export function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value)} %`;
}

/** Numbers as staff read them: 1513 stays "1513", 12500 → "12 500" (groups from five digits). */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("nb-NO", { useGrouping: "min2" }).format(value);
}

/** Kroner as a hotel writes them, grouped from four digits: 2900 → "2 900", 45490 → "45 490". */
export function formatKroner(value: number): string {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(value);
}
