"use client";

import { useCallback, useMemo } from "react";
import { canAccess, useSession } from "@/features/auth";
import type { OrderStatus } from "@/features/dashboard/selectors";
import type { NightState } from "@/features/dashboard/useNight";
import { doorLockFlags, doorLockLines, doorLockSignals } from "@/features/doorlock/feed";
import { eyesOpenItem, useEyesLines } from "@/features/eyes/deviations";
import { clerkNoteOf } from "@/features/nightsource/compose";
import { useNightSource } from "@/features/nightsource/useNightSource";
import { useWithoutRobot } from "@/features/nightsource/useWithoutRobot";
import { type DemoCall, demoCalls } from "@/features/reception/demoCalls";
import { useStoredRecords } from "@/features/reception/useStoredRecords";
import { PHONE_ASSIGNMENTS, phoneTasks } from "@/features/requests/phoneTasks";
import { hotelRoomsOf, selectRequests } from "@/features/requests/select";
import { useRoomCheck } from "@/features/rooms/useRoomCheck";
import { useStaffLines } from "@/features/staffinput/useStaffLines";
import { robotAtHandover } from "./robotState";
import { nightSafety } from "./safety";
import { composeHandover, groupLockDisagreements, type OpenItem, openCount, safetyCount, withExtraItems } from "./select";

/**
 * Overlevering 06:00 composed once, for the page and for the bell (the bell's *Haster* safety alerts and
 * its "5 straks av 13 åpne" line read this, so the two never disagree): the robot's night with the
 * night clerk's own entries added (*Med robot*), or the sources a hotel without a robot has (*Uten
 * robot*, `?kilde=uten-robot`), plus Øyne's avvik. Takes the night the caller already loaded (useNight),
 * so the bell adds no second fetch of the run log.
 */
export function useHandover({
  nightState,
  statusOf,
  today,
  demo,
}: {
  nightState: NightState;
  statusOf: (id: string) => OrderStatus;
  today: string;
  demo?: readonly DemoCall[];
}) {
  const { run, night, rooms, map } = nightState;
  // Tonight's rooms: a call naming a room the hotel doesn't have is "Ukjent rom", never "Gjest venter" here.
  const hotelRooms = useMemo(() => hotelRoomsOf(map, Boolean(night?.ended)), [map, night]);
  const { effectiveRole } = useSession();
  const { records } = useStoredRecords();
  const seeded = useMemo(() => demo ?? demoCalls(today), [demo, today]);
  const phone = useMemo(() => phoneTasks(records, seeded), [records, seeded]);
  const assignments = PHONE_ASSIGNMENTS.use();
  const lines = run.status === "ready" ? run.lines : null;
  // The same room check, marks and money as Rom and Oversikt: a release here moves them too.
  const { reconciliation, marks, revenue, pms } = useRoomCheck(lines, rooms, today);
  // The night clerk's own log (owner B's /natt): her hazards are added to the robot's, never dropped.
  const staff = useStaffLines(today);
  const clerkNote = useMemo(() => clerkNoteOf(staff), [staff]);
  const robotSafety = useMemo(() => (lines ? nightSafety(lines, staff) : null), [lines, staff]);
  const robotState = useMemo(() => (lines ? robotAtHandover(lines) : null), [lines]);

  const canOpen = useCallback((route: string) => effectiveRole === null || canAccess(effectiveRole, route), [effectiveRole]);
  const requests = useMemo(
    () => (night ? selectRequests({ night, calls: null, statusOf, phone, assignments, hotelRooms }) : null),
    [night, statusOf, phone, assignments, hotelRooms],
  );
  const robotHandover = useMemo(() => {
    if (!night || !rooms || !reconciliation || !robotSafety || !requests) return null;
    return composeHandover({
      night,
      rooms,
      reconciliation,
      marks,
      requests,
      phone,
      revenue,
      today,
      pms,
      safety: robotSafety,
      robot: robotState,
      ...(clerkNote ? { note: clerkNote } : {}),
      resolved: (id) => statusOf(id) === "lost",
      canOpen,
    });
  }, [night, rooms, reconciliation, robotSafety, requests, robotState, clerkNote, statusOf, phone, marks, revenue, today, pms, canOpen]);
  // Owner B's switch (round 5: "hotel number one needs no robot", shown): the same page from the
  // booking system, the door lock's one signal per room and the night clerk's own entries.
  const [source, setSource] = useNightSource();
  const withoutRobot = useWithoutRobot({ today, rooms, requests, phone, canOpen });
  const noRobot = source === "none";
  // Without a robot, what can hurt a guest is the night clerk's alone (the page's safety rows are hers).
  const clerkSafety = useMemo(() => (noRobot ? nightSafety([], staff) : null), [noRobot, staff]);
  const composed = noRobot ? (withoutRobot?.handover ?? null) : robotHandover;
  // Øyne's "Ingen av disse": an avvik with an owner, on whichever night the page shows (eyes/deviations.ts).
  const eyesLines = useEyesLines(today);
  // The rooms the booking system and the door lock disagree about (round 7: the pitch line as a heading in Åpent nå, on both nights).
  const disagree = useMemo(() => new Set(doorLockFlags(doorLockSignals(doorLockLines()), pms).map((flag) => flag.room)), [pms]);
  const handover = useMemo(() => {
    if (!composed) return composed;
    const eyes = eyesLines.map((line): OpenItem => {
      const item = eyesOpenItem(line);
      return { ...item, urgent: false, href: canOpen(item.href) ? item.href : null };
    });
    return { ...composed, open: groupLockDisagreements(eyes.length > 0 ? withExtraItems(composed.open, eyes) : composed.open, disagree) };
  }, [composed, eyesLines, canOpen, disagree]);

  return {
    run,
    night,
    lines,
    staff,
    reconciliation,
    marks,
    /** What can hurt a guest on the page shown: the robot's night with the clerk's entries, or hers alone. */
    safety: noRobot ? clerkSafety : robotSafety,
    source,
    setSource,
    noRobot,
    withoutRobot,
    canOpen,
    handover,
  };
}

/** *Åpent nå*'s two numbers, as the page heads it: every sak, and the safety saker (straks) among them. */
export function openSummary(open: readonly OpenItem[]): { total: number; straks: number } {
  return { total: openCount(open), straks: safetyCount(open) };
}
