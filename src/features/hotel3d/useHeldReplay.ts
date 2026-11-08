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
 * (`money.toSell`, the rack's "Bekreft først"), and the rooms sent to reception (`money.released`, "Venter på
 * PMS-en", neutral until the booking system confirms them).
 * The same replay object when nothing applies at this moment.
 */
export function useHeldReplay(replay: HotelReplay): HotelReplay {
  const { reconciliation, money } = useRoomCheck(replay.timeline?.lines ?? null, null);
  const held = reconciliation?.held ?? NONE;
  const toConfirm = money?.toSell ?? NO_SALE;
  // Sent to reception is pending until the booking system confirms it: never a green Klar on the map (round 5).
  const pending = money?.released ?? NO_SALE;
  const snapshot = useMemo(() => withHeldRooms(replay.snapshot, held, toConfirm, pending), [replay.snapshot, held, toConfirm, pending]);
  return snapshot === replay.snapshot ? replay : { ...replay, snapshot };
}
