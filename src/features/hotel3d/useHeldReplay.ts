"use client";

import { useMemo } from "react";
import type { HotelReplay } from "@/features/replay";
import type { Held, Sellable } from "@/features/rooms/reconcile";
import { useRoomCheck } from "@/features/rooms/useRoomCheck";
import { withHeldRooms } from "./held";

const NONE: readonly Held[] = [];
const NO_SALE: readonly Sellable[] = [];

/**
 * The replay with the room check applied to its snapshot (held.ts), from the same `useRoomCheck` Rom,
 * Oversikt and Overlevering read: held rooms, and the rooms still to confirm before they are sold
 * (`money.toSell`, the rack's "Bekreft først"; a release on Rom makes the room a green Klar here too).
 * The same replay object when nothing applies at this moment.
 */
export function useHeldReplay(replay: HotelReplay): HotelReplay {
  const { reconciliation, money } = useRoomCheck(replay.timeline?.lines ?? null, null);
  const held = reconciliation?.held ?? NONE;
  const toConfirm = money?.toSell ?? NO_SALE;
  const snapshot = useMemo(() => withHeldRooms(replay.snapshot, held, toConfirm), [replay.snapshot, held, toConfirm]);
  return snapshot === replay.snapshot ? replay : { ...replay, snapshot };
}
