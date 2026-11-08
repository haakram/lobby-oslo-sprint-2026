"use client";

import { useId } from "react";
import { BASE_HOTEL, floorsOf, type HotelMap, roomsOf } from "@/features/hotel/mapFromRun";
import { placeName, type Snapshot } from "@/features/replay";
import { cx } from "@/ui";
import { roomWord } from "./held";

/**
 * Choose a room from a list: the keyboard's (and a screen reader's) way into the room card, next to
 * clicking a tile on the map. Each option says the room's status in words, so the list also reads
 * every room's state without the colours.
 */
export function RoomPicker({
  map,
  snapshot,
  value,
  onChange,
  className,
}: {
  map: HotelMap | null | undefined;
  snapshot: Snapshot | null;
  value: string | null;
  onChange: (roomId: string | null) => void;
  className?: string;
}) {
  const id = useId();
  const hotel = map ?? BASE_HOTEL;
  const rooms = roomsOf(hotel);
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm text-muted">
        Velg rom
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.currentTarget.value || null)}
        className="min-h-12 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-text"
      >
        <option value="">Ingen rom valgt</option>
        {floorsOf(hotel).map((floor) => {
          const onFloor = rooms.filter((room) => room.floor === floor);
          if (onFloor.length === 0) return null;
          return (
            <optgroup key={floor} label={`${floor}. etasje`}>
              {onFloor.map((room) => (
                <option key={room.id} value={room.id}>
                  {placeName(room.id)} · {roomWord(snapshot?.rooms[room.id])}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}
