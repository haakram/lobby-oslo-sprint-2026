"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/features/auth";
import { formatClock } from "@/features/reception/format";
import { Badge, Button, cx } from "@/ui";
import { actionStamp, stampNow, useNowMs } from "@/ui/stamp";
import { markRoom, type RoomCheckMark } from "./reconcile";

const number = (room: string) => room.replace(/^room-/, "");

/**
 * Selling a room the robot found empty takes two steps, never one tap (jury round 2, the law juror: a guest
 * still holds a room they paid for): *Bekreft med resepsjonen* (the guest has left, folio settled, no
 * bags), then *Merk som ledig for salg*. Each step stamps who and how long ago and can be taken back
 * (*Angre* on a released room steps back to the confirmation). Rom and Overlevering both use it, so the
 * room check and the handover move together. TODO(phase-3): the release writes to the PMS.
 */
export function SellSteps({ room, mark, today, className }: { room: string; mark: RoomCheckMark | undefined; today: string; className?: string }) {
  const { user } = useSession();
  const now = useNowMs();
  const box = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const step = mark?.action === "released" ? "released" : mark?.action === "confirmed" ? "confirmed" : "open";

  // Each step swaps its button for the next one: keep the keyboard on this room.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    box.current?.querySelector<HTMLElement>("[data-step]")?.focus();
  }, [step]);

  const set = (next: RoomCheckMark | null) => {
    moved.current = true;
    markRoom(today, room, next);
  };
  const stamped = () => ({ at: formatClock(new Date().toISOString()), by: user?.name ?? null, stamp: stampNow() });
  const n = number(room);

  return (
    <div ref={box} aria-live="polite" className={cx("flex flex-wrap items-center gap-2", className)}>
      {step === "released" && mark ? (
        <>
          <Badge tone="success">Ledig for salg</Badge>
          <span className="text-sm text-muted">{actionStamp(mark.by, mark.stamp, now)}</span>
          <Button
            variant="ghost"
            size="sm"
            data-step
            data-room-action={room}
            onClick={() => set(mark.confirmed ? { action: "confirmed", ...mark.confirmed } : null)}
            aria-label={`Angre: rom ${n}`}
          >
            Angre
          </Button>
        </>
      ) : step === "confirmed" && mark ? (
        <>
          <Badge>Bekreftet med resepsjonen</Badge>
          <span className="text-sm text-muted">{actionStamp(mark.by, mark.stamp, now)}</span>
          <Button
            variant="secondary"
            size="sm"
            data-step
            data-room-action={room}
            onClick={() => set({ action: "released", ...stamped(), confirmed: { at: mark.at, by: mark.by, stamp: mark.stamp } })}
            aria-label={`Merk rom ${n} som ledig for salg`}
          >
            Merk som ledig for salg
          </Button>
          <Button variant="ghost" size="sm" onClick={() => set(null)} aria-label={`Angre bekreftelsen: rom ${n}`}>
            Angre
          </Button>
          <span className="basis-full text-xs text-muted">Steg 2 av 2: legg rommet ut for salg.</span>
        </>
      ) : (
        <>
          <Button variant="secondary" size="sm" data-step data-room-action={room} onClick={() => set({ action: "confirmed", ...stamped() })} aria-label={`Bekreft med resepsjonen: rom ${n}`}>
            Bekreft med resepsjonen
          </Button>
          <span className="basis-full text-xs text-muted">Steg 1 av 2: resepsjonen bekrefter at gjesten har reist (folio gjort opp, ingen bagasje).</span>
        </>
      )}
    </div>
  );
}
