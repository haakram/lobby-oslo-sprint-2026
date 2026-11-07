"use client";

import { useCallback, useState } from "react";

export type StaffMark = "bekreftet" | "avvist" | "ringt";

export const STAFF_MARKS_STORAGE = "resepsjon-marks-v1";

const MARKS: readonly StaffMark[] = ["bekreftet", "avvist", "ringt"];

function isMark(value: unknown): value is StaffMark {
  return MARKS.includes(value as StaffMark);
}

/** Reads the stored marks; anything blocked, broken or unknown counts as no mark. */
function readMarks(): Record<string, StaffMark> {
  try {
    const raw = localStorage.getItem(STAFF_MARKS_STORAGE);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => isMark(value)));
  } catch {
    return {};
  }
}

function writeMarks(marks: Record<string, StaffMark>): void {
  try {
    localStorage.setItem(STAFF_MARKS_STORAGE, JSON.stringify(marks));
  } catch {
    // Private mode or a full disk: the marks still hold for this visit.
  }
}

/**
 * Staff ticks on this call's requests (Bekreft, Avvis, Ringt tilbake), kept in this browser.
 * TODO(phase-3): a shared store, so every desk sees the same ticks.
 */
export function useStaffMarks() {
  // Read once on the client. On the server there are no records yet, so nothing marked is rendered.
  const [marks, setMarks] = useState<Record<string, StaffMark>>(() =>
    typeof window === "undefined" ? {} : readMarks(),
  );

  const mark = useCallback((id: string, value: StaffMark) => {
    setMarks((current) => {
      const next = { ...current, [id]: value };
      writeMarks(next);
      return next;
    });
  }, []);

  return { marks, mark };
}
