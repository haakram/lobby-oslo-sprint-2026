const NIGHT_DAY = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * "Natt til søndag 8. november": the shift runs 22:00 to 06:00, so it is named after the morning it
 * hands over to. The run log has no sim date; the start line's wall-clock time stands in for it.
 */
export function nightLabel(startedAt: number | null): string | null {
  if (startedAt === null || !Number.isFinite(startedAt)) return null;
  const morning = new Date((startedAt + 24 * 60 * 60) * 1000);
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
