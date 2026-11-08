import { useMemo } from "react";
import type { Product } from "@/features/catalog/products";
import { createLocalStore, recordOf } from "@/features/modules/localStore";
import { type RunLine, parseRunValues } from "@/features/nightshift/runlog";
import { addDays, osloToday } from "@/features/reception/dates";
import { handoverDay, osloClock } from "@/features/staffinput/entries";

/**
 * *Ingen av disse* on Øyne as an avvik (domain review, round 5: "a deviation without an owner" is
 * how a warehouse loses an item). The worker said none of the camera's candidates is the item in hand,
 * or the item is not in the catalogue at all: that becomes the same run-log decision the robot writes
 * for what it finds in the night, `work_order` with `type: "annet"`, marked `source: "eyes"`, so
 * Overlevering 06:00 lists it under *Åpent nå* with an owner and a deadline (`eyesOpenItem`).
 *
 * Kept on this device per handover day, as the night clerk's log is (from 21:00 an entry belongs to
 * the next morning), for 30 days. TODO(phase-3): a server store, so the morning PC sees what a phone
 * reported. No guest data: SKUs, the text on the package and who reported it.
 */

export const EYES_SOURCE = "eyes";
/** The run-log decision kind: the robot's own work orders use it too (docs/runlog.schema.json). */
export const EYES_AVVIK_KIND = "work_order";
/** Housekeeping owns the amenity storeroom (Lager og lin) in a hotel. */
export const EYES_OWNER = "Renhold";
export const EYES_DUE = "10:00";
/** Entries older than this are dropped when the log is read. */
export const KEEP_DAYS = 30;

const MAX_SEEN = 4;
const MAX_SEEN_LENGTH = 40;

type Who = { by: string; now: Date; id?: string };

let sequence = 0;
function makeId(now: Date): string {
  sequence = (sequence + 1) % 1000;
  return `e-${now.getTime().toString(36)}-${sequence}`;
}

function joinNb(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} og ${items.at(-1)}`;
}

/** What the camera read on the package, short enough for one line. */
function seenOf(textSeen: readonly string[]): string[] {
  return textSeen
    .map((line) => line.trim().slice(0, MAX_SEEN_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_SEEN);
}

/**
 * The avvik line. `candidates` are what the worker was shown and said no to (none when the item is
 * simply not in the catalogue); `name` is what the camera called the item.
 */
export function eyesAvvikLine({ candidates, name, textSeen }: { candidates: readonly Product[]; name: string; textSeen: readonly string[] }, { by, now, id }: Who): RunLine {
  const seen = seenOf(textSeen);
  const text =
    candidates.length > 0
      ? `Ukjent vare: ingen av forslagene stemte (${joinNb(candidates.map((product) => product.name))}).`
      : `Ukjent vare: finnes ikke i katalogen${name.trim() ? ` (kameraet så ${name.trim().slice(0, MAX_SEEN_LENGTH).toLowerCase()})` : ""}.`;
  return {
    v: 1,
    t: Math.round(now.getTime() / 1000),
    type: "decision",
    kind: EYES_AVVIK_KIND,
    data: {
      id: id ?? makeId(now),
      type: "annet",
      room: null,
      place: null,
      text,
      candidates: candidates.map((product) => product.sku),
      seen,
      source: EYES_SOURCE,
      by,
      at: osloClock(now),
      stamp: now.toISOString(),
    },
  };
}

/** An avvik from Øyne (and nothing else: the robot's and the night clerk's lines carry another source). */
export function isEyesAvvik(line: RunLine): boolean {
  return line.type === "decision" && line.kind === EYES_AVVIK_KIND && line.data?.source === EYES_SOURCE;
}

/** Lines per handover day (YYYY-MM-DD), oldest first. */
export type EyesLog = Record<string, unknown[]>;

/** The log without days older than `KEEP_DAYS` before `today` (retention as code, not as a promise). */
export function pruneEyesLog(log: EyesLog, today: string): EyesLog {
  const oldest = addDays(today, -KEEP_DAYS);
  return Object.fromEntries(Object.entries(log).filter(([day]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= oldest));
}

export const EYES_LOG = createLocalStore<EyesLog>(
  "lobby:oyne-avvik",
  (raw) => pruneEyesLog(recordOf(raw, (value): value is unknown[] => Array.isArray(value)), osloToday()),
  {},
);

/** Records an avvik on today's handover (or tomorrow's, from 21:00). Returns the day it went to. */
export function appendEyesLine(entry: RunLine, now: Date = new Date()): string {
  const day = handoverDay(now);
  EYES_LOG.set((current) => ({ ...current, [day]: [...(current[day] ?? []), entry] }));
  return day;
}

/** Angre right after a mistaken tap, on the card that made it: the line is taken out again. */
export function removeEyesLine(day: string, id: string) {
  EYES_LOG.set((current) => ({
    ...current,
    [day]: (current[day] ?? []).filter((entry) => !(entry && typeof entry === "object" && (entry as { data?: { id?: unknown } }).data?.id === id)),
  }));
}

/** The stored avvik lines for one handover day, oldest first (anything that is not one is dropped). */
export function storedEyesLines(log: EyesLog, day: string): RunLine[] {
  return parseRunValues(log[day] ?? []).lines.filter(isEyesAvvik);
}

/** Øyne's avvik for one handover day (YYYY-MM-DD), oldest first: Overlevering reads these. */
export function useEyesLines(day: string): RunLine[] {
  const log = EYES_LOG.use();
  return useMemo(() => storedEyesLines(log, day), [log, day]);
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * One *Åpent nå* row for an avvik from Øyne, in the fields Overlevering's open items use: spread it
 * with `urgent: false`, and drop `href` when the reader's role can't open Lager og lin.
 */
export function eyesOpenItem(line: RunLine): { id: string; text: string; lines: string[]; owner: string; due: string; href: string; linkLabel: string } {
  const data = line.type === "decision" ? (line.data ?? {}) : {};
  const seen = Array.isArray(data.seen) ? data.seen.filter((entry): entry is string => typeof entry === "string") : [];
  const by = str(data.by);
  const at = str(data.at).slice(0, 5);
  const reported = [by && `meldt av ${by}`, at && `kl. ${at}`].filter(Boolean).join(" ");
  const fact = [seen.length > 0 ? `Tekst på pakken: ${seen.map((entry) => `«${entry}»`).join(", ")}` : "", reported].filter(Boolean).join(" · ");
  return {
    id: `eyes-${str(data.id)}`,
    text: `${str(data.text)} Finn ut hva det er før varen legges på hylla.`,
    lines: fact ? [fact.charAt(0).toUpperCase() + fact.slice(1)] : [],
    owner: EYES_OWNER,
    due: EYES_DUE,
    href: "/lager",
    linkLabel: "Åpne Lager og lin",
  };
}
