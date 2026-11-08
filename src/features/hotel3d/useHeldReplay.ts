"use client";

import { useMemo } from "react";
import type { HotelReplay } from "@/features/replay";
import type { Held } from "@/features/rooms/reconcile";
import { useRoomCheck } from "@/features/rooms/useRoomCheck";
import { withHeldRooms } from "./held";

const NONE: readonly Held[] = [];

/**
 * The replay with the room check applied to its snapshot (held.ts), from the same `useRoomCheck` Rom,
 * Oversikt and Overlevering read; the same replay object when nothing is held at this moment.
 */
export function useHeldReplay(replay: HotelReplay): HotelReplay {
  const { reconciliation } = useRoomCheck(replay.timeline?.lines ?? null, null);
  const held = reconciliation?.held ?? NONE;
  const snapshot = useMemo(() => withHeldRooms(replay.snapshot, held), [replay.snapshot, held]);
  return snapshot === replay.snapshot ? replay : { ...replay, snapshot };
}
