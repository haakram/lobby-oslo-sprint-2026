"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "@/features/auth";
import { formatClock } from "@/features/reception/format";
import { byRole } from "@/features/staff/testData";
import { Badge, Button, cx, RegenIcon } from "@/ui";
import { actionStamp, stampNow, useNowMs } from "@/ui/stamp";
import { allChecked, CONFIRM_CHECKS, type ConfirmCheck, type Confirmation, markRoom, type RoomCheckMark } from "./reconcile";

const number = (room: string) => room.replace(/^room-/, "");

/** Reception's names for the field's suggestions (never a default): the night receptionist first, who knows at 06:00. */
const RECEPTION = byRole("Resepsjon")
  .slice()
  .sort((a, b) => Number(b.shift === "natt") - Number(a.shift === "natt"))
  .map((member) => member.name);

/** "folio, bagasje, kort": what reception checked, in the short words. */
export function checksShort(checks: readonly string[] | undefined): string {
  return CONFIRM_CHECKS.filter((check) => checks?.includes(check.id))
    .map((check) => check.short)
    .join(", ");
}

/**
 * "Bekreftet av Hanne Vold (resepsjon) · registrert av Siri Haugen · folio, bagasje, kort": step 1's
 * evidence in one line. Both people (round 7, legal review): the receptionist who confirmed never logs in
 * here, so the record says who typed her name (`by`, when given).
 */
export function confirmationLine(confirmation: (Pick<Confirmation, "receptionist" | "checks"> & { by?: string | null }) | undefined): string | null {
  if (!confirmation?.receptionist) return null;
  const checks = checksShort(confirmation.checks);
  const recorded = confirmation.by ? ` · registrert av ${confirmation.by}` : "";
  return `Bekreftet av ${confirmation.receptionist} (resepsjon)${recorded}${checks ? ` · ${checks}` : ""}`;
}

/**
 * Selling a room the robot found empty takes two steps, never one tap (round 2, legal review: a guest
 * still holds a room they paid for), and each leaves evidence (round 4, legal and product review):
 * 1. *Bekreft med resepsjonen*: WHICH receptionist confirmed (a name the reader types or picks; the field
 *    starts empty, round 6, legal review: a prefilled name on an accountability record is a claim nobody
 *    made), and three ticks, folio settled, no bags in the room, key card blocked. The button opens only
 *    with a name and all three; the mark stores the name, the ticks, who recorded it and when.
 * 2. *Send til resepsjonen*: the pilot reads the booking system and never writes it, so the check-out in
 *    the PMS is reception's. The room then reads *Venter på PMS-en*, never "done", until the booking
 *    system shows it free. TODO(phase-3): the PMS connector reads the check-out back and turns it green.
 * Each step can be taken back (*Angre* on a sent room steps back to the confirmation, with its ticks).
 * Rom and Overlevering both use it; on Overlevering it is the page's one orange action (`primary`).
 */
export function SellSteps({
  room,
  mark,
  today,
  primary = false,
  className,
}: {
  room: string;
  mark: RoomCheckMark | undefined;
  today: string;
  /** The page's one orange action (Overlevering); a quiet outline elsewhere (Rom has its own primary). */
  primary?: boolean;
  className?: string;
}) {
  const { user } = useSession();
  const now = useNowMs();
  const box = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const id = useId();
  const step = mark?.action === "released" ? "released" : mark?.action === "confirmed" && mark.receptionist && allChecked(mark.checks) ? "confirmed" : "open";
  const [receptionist, setReceptionist] = useState(() => mark?.receptionist ?? mark?.confirmed?.receptionist ?? "");
  const [checks, setChecks] = useState<ConfirmCheck[]>(() => mark?.checks ?? mark?.confirmed?.checks ?? []);
  const [tried, setTried] = useState(false);
  const ready = receptionist.trim().length > 0 && allChecked(checks);

  // Each step swaps its controls for the next ones: keep the keyboard on this room.
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
  const variant = primary ? "primary" : "secondary";

  const confirm = () => {
    if (!ready) {
      setTried(true);
      return;
    }
    setTried(false);
    // Back to step 1 later (Angre), the form still holds what was ticked.
    set({ action: "confirmed", ...stamped(), receptionist: receptionist.trim(), checks: CONFIRM_CHECKS.map((check) => check.id).filter((check) => checks.includes(check)) });
  };

  if (step === "released" && mark) {
    const evidence = confirmationLine(mark.confirmed);
    return (
      <div ref={box} aria-live="polite" className={cx("flex flex-wrap items-center gap-2", className)}>
        {/* Pending, in a word and without green: the booking system has not said the room is free. */}
        <Badge>
          <RegenIcon name="clock" size={14} className="mr-1 inline-block align-[-0.15em]" />
          Venter på PMS-en
        </Badge>
        <span className="text-sm text-muted">Sendt av {actionStamp(mark.by, mark.stamp, now)}</span>
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
        <span className="basis-full text-xs text-muted">
          {evidence ? `${evidence}. ` : ""}Resepsjonen sjekker ut gjesten i PMS-en. PMS-koblingen er ikke bygget ennå.
        </span>
      </div>
    );
  }

  if (step === "confirmed" && mark) {
    return (
      <div ref={box} aria-live="polite" className={cx("flex flex-wrap items-center gap-2", className)}>
        {/* Who typed it stands beside the badge, with when: "Registrert av Siri Haugen · nå". */}
        <Badge>{confirmationLine({ receptionist: mark.receptionist, checks: mark.checks }) ?? "Bekreftet med resepsjonen"}</Badge>
        <span className="text-sm text-muted">Registrert av {actionStamp(mark.by, mark.stamp, now)}</span>
        <span className="flex basis-full flex-wrap items-center gap-2">
          <Button
            variant={variant}
            size="sm"
            data-step
            data-room-action={room}
            onClick={() => set({ action: "released", ...stamped(), confirmed: { at: mark.at, by: mark.by, stamp: mark.stamp, receptionist: mark.receptionist, checks: mark.checks } })}
            aria-label={`Send til resepsjonen: rom ${n}`}
          >
            <RegenIcon name="send" size={18} />
            Send til resepsjonen
          </Button>
          <Button variant="ghost" size="sm" onClick={() => set(null)} aria-label={`Angre bekreftelsen: rom ${n}`}>
            Angre
          </Button>
        </span>
        <span className="basis-full text-xs text-muted">Steg 2 av 2: resepsjonen sjekker ut gjesten i PMS-en. Lobby leser bookingsystemet, men endrer det ikke.</span>
      </div>
    );
  }

  return (
    <div ref={box} className={cx("min-w-0", className)}>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-xs text-muted">Steg 1 av 2: har gjesten reist?</legend>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label htmlFor={`${id}-who`} className="text-sm font-semibold">
            Hvem i resepsjonen bekreftet?
          </label>
          <input
            id={`${id}-who`}
            name="receptionist"
            list={`${id}-names`}
            autoComplete="off"
            placeholder="Velg eller skriv navnet"
            value={receptionist}
            onChange={(event) => setReceptionist(event.target.value)}
            aria-invalid={(tried && receptionist.trim().length === 0) || undefined}
            className="min-h-11 w-full max-w-[16rem] rounded-md border border-line-strong bg-surface px-3 text-base text-text placeholder:text-muted transition-colors duration-150 ease-standard aria-[invalid=true]:border-danger"
          />
          <datalist id={`${id}-names`}>
            {RECEPTION.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <ul className="flex flex-wrap gap-x-4" aria-label="Det resepsjonen sjekket">
          {CONFIRM_CHECKS.map((check) => (
            <li key={check.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm pointer-fine:min-h-9">
                <input
                  type="checkbox"
                  name={check.id}
                  checked={checks.includes(check.id)}
                  onChange={(event) => {
                    const on = event.currentTarget.checked;
                    setChecks((current) => (on ? [...current.filter((entry) => entry !== check.id), check.id] : current.filter((entry) => entry !== check.id)));
                  }}
                  className="size-5 accent-text"
                />
                {check.label}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            variant={variant}
            size="sm"
            data-step
            data-room-action={room}
            aria-disabled={!ready || undefined}
            aria-describedby={`${id}-why`}
            onClick={confirm}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
            aria-label={`Bekreft med resepsjonen: rom ${n}`}
          >
            Bekreft med resepsjonen
          </Button>
          {/* Never a grey button without the reason beside it. */}
          <span id={`${id}-why`} aria-live="polite" className={cx("text-xs", tried && !ready ? "font-semibold text-danger" : "text-muted")}>
            {ready ? "Lagres med navnet, sjekkene, hvem og når." : receptionist.trim().length === 0 ? "Skriv navnet først." : "Kryss av alle tre."}
          </span>
        </div>
      </fieldset>
    </div>
  );
}
