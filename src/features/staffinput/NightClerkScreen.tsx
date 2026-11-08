"use client";

import { type FormEvent, type ReactNode, type Ref, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/features/auth";
import { hhmm } from "@/features/dashboard/format";
import { placeLabel } from "@/features/dashboard/labels";
import type { RoomView } from "@/features/dashboard/selectors";
import { useNight } from "@/features/dashboard/useNight";
import { type DoorFlag, doorLockFlags, doorLockLines, doorLockSignals, doorSignalText } from "@/features/doorlock/feed";
import { nightSafety } from "@/features/handover/safety";
import type { HotelMap } from "@/features/hotel";
import type { RunStatus } from "@/features/nightshift/useRun";
import { ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { shortDate } from "@/features/rooms/money";
import { type PmsRoom, pmsLastNight } from "@/features/rooms/pms";
import { Badge, Button, Card, cx, ErrorState, RegenIcon, Skeleton } from "@/ui";
import { actionStamp, useNowMs } from "@/ui/stamp";
import {
  acknowledgeLine,
  appendStaffLine,
  HAZARD_CHOICES,
  type HazardKind,
  handoverDay,
  hazardLine,
  NOTE_MAX,
  noteLine,
  retractLine,
  ROOM_CHOICES,
  roomLine,
  signPlacedLine,
  type StaffRoomStatus,
} from "./entries";
import { entryText, placePhrase, readStaffLog, signPhrase, type StaffAck, type StaffEntry, staffAcks, staffRooms, statusWord } from "./read";
import { RETENTION_DAYS } from "./retention";
import { type RobotHazard, robotHazardsOf } from "./robotHazards";
import { useStaffLines } from "./useStaffLines";

const DAY_LABEL = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "søndag 8. november" from "2026-11-08". */
function dayLabel(day: string): string {
  return DAY_LABEL.format(new Date(`${day}T12:00:00Z`));
}

const number = (room: string) => room.replace(/^room-/, "");
const TILE_WORD: Record<StaffRoomStatus, string> = { klar: "tomt", opptatt: "ikke tomt", ma_vaskes: "vask" };

/** "Kjersti Lund · kl. 04:24" for an entry in the night, "Siri Haugen · nå" for one typed by day. */
function entryStamp(entry: StaffEntry, now: number): string {
  const hour = entry.at ? Number(entry.at.slice(0, 2)) : null;
  if (entry.at && hour !== null && (hour >= 21 || hour < 7)) return `${entry.by} · kl. ${hhmm(entry.at)}`;
  return actionStamp(entry.by, entry.stamp, now);
}

/**
 * What the booking system says about a room tonight, in the desk's words. The guest's name only where
 * the lock and the booking system disagree (`named`): there she is checking his departure; elsewhere
 * "booket" is all she needs (round 6, legal review: no guest name on an unflagged room).
 */
function bookingLine(booked: PmsRoom | undefined, day: string, named: boolean): string {
  if (!booked) return "Systemet: ledig i natt";
  const who = named ? (booked.guest ?? "en gjest") : "booket";
  if (booked.departure < day) return `Systemet: ${who}, skulle reist ${shortDate(booked.departure)} (utsjekk ikke registrert)`;
  if (booked.departure === day) return `Systemet: ${who}, reiser i dag`;
  return named ? `Systemet: ${who} til ${shortDate(booked.departure)}` : `Systemet: booket til ${shortDate(booked.departure)}`;
}

/** The places a safety item can be: the hotel's corridors and shared spaces, floor by floor. */
function placesOf(map: HotelMap): { floor: number; places: { id: string; label: string }[] }[] {
  const byFloor = new Map<number, { id: string; label: string }[]>();
  for (const node of Object.values(map.nodes)) {
    if (node.kind === "room" || node.id === "charging-dock") continue;
    const list = byFloor.get(node.floor) ?? [];
    list.push({ id: node.id, label: placeLabel(node.id) });
    byFloor.set(node.floor, list);
  }
  const rank = (id: string) => (id.startsWith("corridor-") ? 1 : id.startsWith("elevator-") || id.startsWith("stairwell-") ? 2 : 0);
  return [...byFloor]
    .sort(([a], [b]) => a - b)
    .map(([floor, places]) => ({ floor, places: places.sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label, "nb")) }));
}

/**
 * Nattevaktens logg (round 5, founders, product and marketing reviews): the night clerk's own input, so a hotel with no
 * robot still gets its 06:00 handover. A room in two taps (the room, then what she saw), a safety item
 * with its place, a short note. Each becomes the same run-log line the robot writes, with her name, and
 * Overlevering reads it (*Uten robot*). The door lock's flags (a booked room with no card, a card in a
 * free room) sit at the top as the rooms worth a look. Stored on this device for the pilot.
 */
export function NightClerkScreen({ viewerUrl }: { viewerUrl?: string }) {
  const { user } = useSession();
  const by = user?.name ?? "Nattevakten";
  const now = useNowMs();
  const day = handoverDay(now ? new Date(now) : new Date());
  // TODO(phase-3): the room list from the PMS; today the hotel's rooms as every screen reads them.
  const { run, rooms, map } = useNight(viewerUrl);
  const lines = useStaffLines(day);
  const entries = useMemo(() => readStaffLog(lines), [lines]);
  const logged = useMemo(() => staffRooms(entries), [entries]);
  const pms = useMemo(() => pmsLastNight(day), [day]);
  const signals = useMemo(() => doorLockSignals(doorLockLines()), []);
  const flags = useMemo(() => doorLockFlags(signals, pms), [signals, pms]);
  // The robot's hazards as its run log has them (a live shift grows its log), and which she acknowledged.
  const safety = useMemo(() => (run.status === "ready" ? nightSafety(run.lines) : null), [run.status, run.lines]);
  const robotHazards = useMemo(() => robotHazardsOf(safety), [safety]);
  const acks = useMemo(() => staffAcks(entries), [entries]);
  const [selected, setSelected] = useState<string | null>(null);
  const roomPanel = useRef<HTMLDivElement>(null);

  // No robot that night (an empty log): no box for it.
  const robotNight = run.status !== "empty";
  const add = (entry: Parameters<typeof appendStaffLine>[1]) => appendStaffLine(day, entry);
  const who = () => ({ by, now: new Date() });
  // From a flag at the top: bring the room's choices into view and to the keyboard once they are drawn.
  const focusRoom = useRef(false);
  const choose = (room: string) => {
    focusRoom.current = true;
    setSelected(room);
  };
  useEffect(() => {
    // The rooms may still be loading: wait until the room's panel is there.
    if (!focusRoom.current || !selected || !roomPanel.current) return;
    focusRoom.current = false;
    roomPanel.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    roomPanel.current.querySelector<HTMLElement>("[data-room-heading]")?.focus();
  }, [selected, rooms]);

  return (
    <ModulePage module="natt" lede="Det du ser i natt, rett inn i overleveringen kl. 06:00." meta={<Badge>Til overleveringen {dayLabel(day)}</Badge>}>
      {/* Phone: the robot's hazards, the lock's flags, the rooms, safety, the note, the log. Desktop: the work on the left; the robot, the flags and the log on the right. */}
      <div
        className={cx(
          "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:gap-8",
          robotNight ? "lg:grid-rows-[auto_auto_1fr]" : "lg:grid-rows-[auto_1fr]",
        )}
      >
        {robotNight && (
          <FromRobot
            status={run.status}
            hazards={robotHazards}
            acks={acks}
            now={now}
            onAck={(hazard) => add(acknowledgeLine(hazard, who()))}
            onUndo={(id) => add(retractLine(id, who()))}
            onRetry={run.retry}
            className="lg:col-start-2 lg:row-start-1"
          />
        )}
        <CheckFirst flags={flags} logged={logged} onChoose={choose} className={cx("lg:col-start-2", robotNight ? "lg:row-start-2" : "lg:row-start-1")} />

        <div className={cx("flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1", robotNight ? "lg:row-span-3" : "lg:row-span-2")}>
          <section aria-labelledby="rooms-heading" data-enter>
            <Card className="sm:p-6">
              <PanelHead id="rooms-heading" title="Rom" note="Velg rommet, så det du så." />
              {run.status === "error" ? (
                <ErrorState
                  className="mt-4"
                  title="Fikk ikke lastet rommene"
                  body="Sikkerhet og notat virker likevel. Sjekk nettet og prøv igjen."
                  action={
                    <Button variant="secondary" onClick={run.retry}>
                      Prøv igjen
                    </Button>
                  }
                />
              ) : !rooms ? (
                <div role="status" aria-busy="true" className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
                  <span className="sr-only">Henter rommene</span>
                  {Array.from({ length: 14 }, (_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : (
                <RoomPicker
                  rooms={rooms}
                  flags={flags}
                  logged={logged}
                  selected={selected}
                  onSelect={setSelected}
                  panel={
                    selected ? (
                      <RoomChoices
                        ref={roomPanel}
                        room={selected}
                        booked={pms.get(selected)}
                        flag={flags.find((flag) => flag.room === selected)}
                        current={logged.get(selected)}
                        day={day}
                        now={now}
                        onChoose={(status) => add(roomLine(selected, status, who()))}
                        onUndo={(id) => add(retractLine(id, who()))}
                      />
                    ) : null
                  }
                />
              )}
            </Card>
          </section>

          <SafetyForm map={map} onReport={(kind, place, note, signed) => add(hazardLine(kind, place, note, who(), signed))} />
          <NoteForm onSave={(text) => add(noteLine(text, who()))} />
        </div>

        <Tonight
          entries={entries}
          now={now}
          onUndo={(id) => add(retractLine(id, who()))}
          onSign={(id) => add(signPlacedLine(id, who()))}
          className={cx("lg:col-start-2", robotNight ? "lg:row-start-3" : "lg:row-start-2")}
        />
      </div>
    </ModulePage>
  );
}

/**
 * Fra roboten (round 6, domain review: "06:00 is the wrong moment for safety"): what the robot's run log
 * says can hurt a guest, at the robot's clock, newest first, each with one *Kvitter* tap. The tap is the
 * outside signal: who saw it and when, stored like her other entries, and Overlevering shows how long each
 * hazard waited for a person. Once acknowledged, a row folds to one line with *Angre*.
 */
function FromRobot({
  status,
  hazards,
  acks,
  now,
  onAck,
  onUndo,
  onRetry,
  className,
}: {
  status: RunStatus;
  hazards: readonly RobotHazard[];
  acks: ReadonlyMap<string, StaffAck>;
  now: number;
  onAck: (hazard: RobotHazard) => void;
  onUndo: (id: string) => void;
  onRetry: () => void;
  className?: string;
}) {
  const open = hazards.filter((hazard) => !acks.has(hazard.key)).length;
  const newest = [...hazards].reverse();
  return (
    <section aria-labelledby="robot-heading" data-enter className={className}>
      <Card className="sm:p-6">
        <PanelHead
          id="robot-heading"
          title="Fra roboten"
          action={status === "ready" && open > 0 ? <Badge tone="danger">{open} ikke kvittert</Badge> : undefined}
        />
        <p className="mt-1 text-sm text-muted">Det roboten meldte som kan skade en gjest. Kvitter når du har sett det.</p>
        {status === "loading" ? (
          <div role="status" aria-busy="true" className="mt-3 flex flex-col gap-3">
            <span className="sr-only">Henter det roboten meldte</span>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : status === "error" ? (
          <div className="mt-3 flex flex-col items-start gap-2">
            <p className="text-sm">Fikk ikke lastet det roboten meldte. Sjekk nettet og prøv igjen.</p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Prøv igjen
            </Button>
          </div>
        ) : hazards.length === 0 ? (
          <p className="mt-3 flex items-start gap-2 text-base">
            <RegenIcon name="circle-check" size={20} className="mt-0.5 shrink-0 text-success" />
            Roboten har ikke meldt noe som kan skade en gjest.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {newest.map((hazard) => {
              const ack = acks.get(hazard.key);
              const clock = hazard.at ? hhmm(hazard.at) : "–";
              if (ack) {
                return (
                  <li key={hazard.key} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5">
                    <div className="flex min-w-0 grow basis-48 flex-col gap-0.5">
                      <p className="text-sm">
                        <span className="font-mono tabular-nums">{clock}</span> {hazard.title}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        <RegenIcon name="circle-check" size={14} className="shrink-0 text-success" />
                        Kvittert av {entryStamp(ack, now)}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="-mr-3" onClick={() => onUndo(ack.id)} aria-label={`Angre kvitteringen: ${hazard.title}`}>
                      Angre
                    </Button>
                  </li>
                );
              }
              return (
                <li key={hazard.key} className="flex items-baseline gap-3 py-3">
                  <span className="font-mono text-sm font-medium tabular-nums">{clock}</span>
                  <div className="flex min-w-0 flex-col items-start gap-0.5">
                    <p className="text-base font-semibold">{hazard.title}</p>
                    <p className="text-sm text-muted">{hazard.detail}</p>
                    <Button variant="secondary" size="sm" className="mt-1.5" onClick={() => onAck(hazard)} aria-label={`Kvitter: ${hazard.title}`}>
                      Kvitter
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Fra robotens natt (kjøringsloggen). Overleveringen viser hvem som kvitterte, og hvor lenge det ventet.</p>
      </Card>
    </section>
  );
}

function CheckFirst({ flags, logged, onChoose, className }: { flags: readonly DoorFlag[]; logged: ReadonlyMap<string, StaffEntry & { kind: "room" }>; onChoose: (room: string) => void; className?: string }) {
  const open = flags.filter((flag) => !logged.has(flag.room));
  const checked = flags.filter((flag) => logged.has(flag.room));
  return (
    <section aria-labelledby="check-heading" data-enter className={className}>
      <Card className="sm:p-6">
        <PanelHead id="check-heading" title="Sjekk disse først" count={open.length > 0 ? open.length : undefined} />
        <p className="mt-1 text-sm text-muted">Der dørlåsen og bookingsystemet er uenige.</p>
        {flags.length === 0 ? (
          <p className="mt-3 flex items-start gap-2 text-base">
            <RegenIcon name="circle-check" size={20} className="mt-0.5 shrink-0 text-success" />
            Dørlåsen og systemet er enige om alle rom.
          </p>
        ) : (
          <>
            {open.length > 0 && (
              <ul className="mt-2 divide-y divide-line">
                {open.map((flag) => (
                  <li key={flag.room} className="flex flex-col gap-2 py-3">
                    <p className="text-base">
                      <span className="font-mono font-medium tabular-nums">{number(flag.room)}</span>
                      <span className="text-muted"> · </span>
                      {flag.kind === "empty"
                        ? `${capitalise(doorSignalText(flag.signal))}, men systemet har ${flag.guest ?? "en gjest"} der.`
                        : `${capitalise(doorSignalText(flag.signal))}, men rommet er ledig i systemet.`}
                    </p>
                    <Button variant="secondary" size="sm" className="self-start" onClick={() => onChoose(flag.room)}>
                      Sjekk rom {number(flag.room)}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {/* Once checked, a flag folds to one line: the clerk opens this screen to log, not to reread. */}
            {checked.length > 0 && (
              <ul className={cx("flex flex-col gap-1.5", open.length > 0 ? "border-t border-line pt-3" : "mt-3")}>
                {checked.map((flag) => (
                  <li key={flag.room} className="flex items-start gap-2 text-sm">
                    <RegenIcon name="circle-check" size={16} className="mt-0.5 shrink-0 text-success" />
                    <span>
                      <span className="font-mono font-medium tabular-nums">{number(flag.room)}</span> sjekket: {statusWord(logged.get(flag.room)!.status)}
                      <span className="text-muted"> ({doorSignalText(flag.signal)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="mt-3 text-xs text-muted">Dørlåsen gir ett signal per rom, aldri hvem eller når. Testdata til låsen er koblet til.</p>
      </Card>
    </section>
  );
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function RoomPicker({
  rooms,
  flags,
  logged,
  selected,
  onSelect,
  panel,
}: {
  rooms: readonly RoomView[];
  flags: readonly DoorFlag[];
  logged: ReadonlyMap<string, StaffEntry & { kind: "room" }>;
  selected: string | null;
  onSelect: (room: string | null) => void;
  panel: ReactNode;
}) {
  const floors = useMemo(() => [...new Set(rooms.map((room) => room.floor))].sort((a, b) => a - b), [rooms]);
  const flagged = useMemo(() => new Set(flags.filter((flag) => !logged.has(flag.room)).map((flag) => flag.room)), [flags, logged]);
  const [floorChoice, setFloor] = useState<number | null>(null);
  // A selected room shows its own floor; otherwise the floor last chosen, the first flagged room's, or the lowest.
  const selectedFloor = rooms.find((room) => room.id === selected)?.floor;
  const current = selectedFloor ?? floorChoice ?? rooms.find((room) => flagged.has(room.id))?.floor ?? floors[0];
  const shown = rooms.filter((room) => room.floor === current);

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div role="group" aria-label="Etasje" className="inline-flex flex-wrap gap-0.5 self-start rounded-sm bg-sunken p-0.5">
        {floors.map((level) => (
          <button
            key={level}
            type="button"
            aria-pressed={current === level}
            onClick={() => {
              setFloor(level);
              if (level !== current) onSelect(null);
            }}
            className={cx(
              "min-h-10 rounded-sm px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-[120ms] ease-standard pointer-coarse:min-h-11",
              current === level ? "bg-surface text-text" : "text-muted hover:text-text",
            )}
          >
            {level}. etasje
          </button>
        ))}
      </div>
      <ul aria-label={`Rom i ${current}. etasje`} className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {shown.map((room) => {
          const seen = logged.get(room.id);
          const flag = flagged.has(room.id);
          return (
            <li key={room.id} className="min-w-0">
              <button
                type="button"
                aria-pressed={selected === room.id}
                aria-label={`Rom ${room.number}${seen ? `, ${statusWord(seen.status)}` : flag ? ", dørlåsen vil ha en sjekk" : ""}`}
                onClick={() => onSelect(room.id)}
                className={cx(
                  "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-sm border px-1 transition-colors duration-[120ms] ease-standard active:scale-[0.97]",
                  selected === room.id ? "border-text bg-surface ring-2 ring-text" : seen ? "border-line bg-sunken" : "border-line bg-surface hover:bg-sunken",
                  flag && selected !== room.id && "border-dashed border-line-strong",
                )}
              >
                <span className="font-mono text-base font-medium tabular-nums">{room.number}</span>
                {seen ? (
                  <span className="text-xs text-muted">{TILE_WORD[seen.status]}</span>
                ) : flag ? (
                  <span className="text-xs font-semibold text-text">sjekk</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {panel ?? <p className="text-sm text-muted">Velg et rom over for å logge det.</p>}
    </div>
  );
}

function RoomChoices({
  ref,
  room,
  booked,
  flag,
  current,
  day,
  now,
  onChoose,
  onUndo,
}: {
  ref: Ref<HTMLDivElement>;
  room: string;
  booked: PmsRoom | undefined;
  /** Set where the lock and the booking system disagree: only then the lock's line and the guest's name. */
  flag: DoorFlag | undefined;
  current: (StaffEntry & { kind: "room" }) | undefined;
  day: string;
  now: number;
  onChoose: (status: StaffRoomStatus) => void;
  onUndo: (id: string) => void;
}) {
  return (
    <div ref={ref} className="flex flex-col gap-4 rounded-md bg-sunken p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h3 data-room-heading tabIndex={-1} className="flex items-baseline gap-2 outline-none">
          <span className="text-lg font-semibold">Rom</span> <span className="font-mono text-2xl font-medium tabular-nums">{number(room)}</span>
        </h3>
        <p className="text-sm">{bookingLine(booked, day, Boolean(flag))}</p>
        {/* Round 6, legal review: the lock's word only where it and the booking system disagree. */}
        {flag && <p className="text-sm">Dørlåsen: {doorSignalText(flag.signal)}</p>}
        {booked && <p className="text-sm text-muted">Rommet er booket: bank på og vent før du går inn.</p>}
      </div>
      <div role="group" aria-label={`Hva du så på rom ${number(room)}`} className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {ROOM_CHOICES.map((choice) => {
          const on = current?.status === choice.status;
          return (
            <button
              key={choice.status}
              type="button"
              aria-pressed={on}
              onClick={() => onChoose(choice.status)}
              className={cx(
                "flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-md border px-4 py-2 text-left transition-[background-color,transform] duration-[120ms] ease-standard active:scale-[0.97]",
                on ? "border-text bg-surface ring-2 ring-text" : "border-line-strong bg-surface hover:bg-sunken",
              )}
            >
              <span className="flex items-center gap-1.5 text-base font-semibold">
                {on && <RegenIcon name="check" size={18} strokeWidth={2.25} />}
                {choice.word}
              </span>
              <span className="text-xs text-muted">{choice.hint}</span>
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1">
        {current && (
          <>
            <p className="flex items-center gap-1.5 text-sm">
              <RegenIcon name="circle-check" size={16} className="shrink-0 text-success" />
              Logget: {statusWord(current.status)} · {entryStamp(current, now)}
            </p>
            <Button variant="ghost" size="sm" onClick={() => onUndo(current.id)} aria-label={`Angre: rom ${number(room)}`}>
              Angre
            </Button>
          </>
        )}
      </div>
      {/* The worst case is the wrong room sold: the clerk's look never sells it on its own. */}
      <p className="text-xs text-muted">«Tom og ryddig» selger ikke rommet. Resepsjonen bekrefter først, i overleveringen.</p>
    </div>
  );
}

function SafetyForm({ map, onReport }: { map: HotelMap; onReport: (kind: HazardKind, place: string, note: string, signed: boolean) => void }) {
  const groups = useMemo(() => placesOf(map), [map]);
  const [kind, setKind] = useState<HazardKind>("wet");
  const [place, setPlace] = useState("");
  // A wet floor needs an answer: is a sign out (round 6, legal review: the record shows care when there was care).
  const [signed, setSigned] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);
  const [signError, setSignError] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const select = useRef<HTMLSelectElement>(null);
  const signYes = useRef<HTMLButtonElement>(null);
  const wet = kind === "wet";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const missingPlace = !place;
    const missingSign = wet && signed === null;
    if (missingPlace || missingSign) {
      setError(missingPlace);
      setSignError(missingSign);
      if (missingPlace) select.current?.focus();
      else signYes.current?.focus();
      return;
    }
    onReport(kind, place, note, wet && signed === true);
    const what = `${HAZARD_CHOICES.find((choice) => choice.kind === kind)?.word ?? "Saken"} ${placePhrase(place)}`;
    setDone(wet ? `${what} er meldt, ${signed ? "skilt satt ut" : "uten skilt"}.` : `${what} er meldt.`);
    setPlace("");
    setNote("");
    setSigned(null);
    setError(false);
    setSignError(false);
  };

  return (
    <section aria-labelledby="safety-heading" data-enter>
      <Card className="sm:p-6">
        <PanelHead id="safety-heading" title="Noe som kan skade en gjest" />
        <p className="mt-1 text-sm text-muted">Står øverst i overleveringen, med en eier og «straks».</p>
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Hva</legend>
            <div className="inline-flex flex-wrap gap-0.5 self-start rounded-sm bg-sunken p-0.5">
              {HAZARD_CHOICES.map((choice) => (
                <button
                  key={choice.kind}
                  type="button"
                  aria-pressed={kind === choice.kind}
                  onClick={() => {
                    setKind(choice.kind);
                    setSignError(false);
                  }}
                  className={cx(
                    "min-h-11 rounded-sm px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-[120ms] ease-standard",
                    kind === choice.kind ? "bg-surface text-text" : "text-muted hover:text-text",
                  )}
                >
                  {choice.word}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="safety-place" className="text-sm font-medium">
              Hvor
            </label>
            <select
              id="safety-place"
              ref={select}
              value={place}
              onChange={(event) => {
                setPlace(event.target.value);
                setError(false);
              }}
              aria-invalid={error || undefined}
              aria-describedby={error ? "safety-place-error" : undefined}
              className={cx(
                "min-h-12 w-full max-w-sm rounded-md border bg-sunken px-3 text-base text-text",
                error ? "border-danger" : "border-line-strong",
              )}
            >
              <option value="">Velg sted</option>
              {groups.map((group) => (
                <optgroup key={group.floor} label={`${group.floor}. etasje`}>
                  {group.places.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {error && (
              <p id="safety-place-error" className="text-sm text-danger">
                Velg hvor det er, så vet morgenvakten hvor hun skal gå.
              </p>
            )}
          </div>
          {wet && (
            <fieldset className="flex flex-col gap-2" aria-describedby={signError ? "safety-sign-error" : undefined}>
              <legend className="mb-2 text-sm font-medium">Skilt satt ut?</legend>
              {/* Two equal answers: neither is the loud one. */}
              <div className={cx("inline-flex gap-0.5 self-start rounded-sm bg-sunken p-0.5", signError && "ring-1 ring-danger")}>
                {[
                  { value: true, word: "Ja" },
                  { value: false, word: "Nei" },
                ].map((choice) => (
                  <button
                    key={choice.word}
                    ref={choice.value ? signYes : undefined}
                    type="button"
                    aria-pressed={signed === choice.value}
                    onClick={() => {
                      setSigned(choice.value);
                      setSignError(false);
                    }}
                    className={cx(
                      "min-h-11 min-w-20 rounded-sm px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-[120ms] ease-standard",
                      signed === choice.value ? "bg-surface text-text" : "text-muted hover:text-text",
                    )}
                  >
                    {choice.word}
                  </button>
                ))}
              </div>
              {signError && (
                <p id="safety-sign-error" className="text-sm text-danger">
                  Svar ja eller nei, så vet morgenvakten om gulvet står uten skilt.
                </p>
              )}
            </fieldset>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="safety-note" className="text-sm font-medium">
              Mer om det <span className="font-normal text-muted">(valgfritt)</span>
            </label>
            <input
              id="safety-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={120}
              enterKeyHint="send"
              autoComplete="off"
              placeholder="F.eks. ved inngangen"
              className="min-h-12 w-full max-w-xl rounded-md border border-line-strong bg-sunken px-3 text-base text-text placeholder:text-muted"
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" size="lg" className="w-full sm:w-auto">
              Meld fra til morgenvakten
            </Button>
            <p aria-live="polite" className="text-sm">
              {done && (
                <span className="flex items-center gap-1.5">
                  <RegenIcon name="circle-check" size={16} className="shrink-0 text-success" />
                  {done}
                </span>
              )}
            </p>
          </div>
        </form>
      </Card>
    </section>
  );
}

function NoteForm({ onSave }: { onSave: (text: string) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const left = NOTE_MAX - text.length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) {
      setError(true);
      return;
    }
    onSave(text);
    setText("");
    setError(false);
    setSaved(true);
  };

  return (
    <section aria-labelledby="note-heading" data-enter>
      <Card className="sm:p-6">
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label id="note-heading" htmlFor="night-note" className="text-lg font-semibold tracking-[-0.01em]">
              Notat til morgenvakten
            </label>
            <textarea
              id="night-note"
              value={text}
              onChange={(event) => {
                setText(event.target.value.slice(0, NOTE_MAX));
                setError(false);
                setSaved(false);
              }}
              rows={3}
              maxLength={NOTE_MAX}
              aria-invalid={error || undefined}
              aria-describedby="night-note-hint"
              className={cx("w-full rounded-md border bg-sunken px-3 py-2 text-base text-text", error ? "border-danger" : "border-line-strong")}
            />
            <p id="night-note-hint" className={cx("text-sm", error ? "text-danger" : "text-muted")}>
              {error ? "Skriv noe først." : left <= 40 ? `${left} tegn igjen` : "Det morgenvakten bør vite som ikke er et rom eller en fare."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" variant="secondary" className="w-full sm:w-auto">
              Lagre notatet
            </Button>
            <p aria-live="polite" className="text-sm">
              {saved && (
                <span className="flex items-center gap-1.5">
                  <RegenIcon name="circle-check" size={16} className="shrink-0 text-success" />
                  Notatet står i overleveringen.
                </span>
              )}
            </p>
          </div>
        </form>
      </Card>
    </section>
  );
}

function Tonight({
  entries,
  now,
  onUndo,
  onSign,
  className,
}: {
  entries: readonly StaffEntry[];
  now: number;
  onUndo: (id: string) => void;
  /** The sign is out now on a wet floor she reported without one. */
  onSign: (id: string) => void;
  className?: string;
}) {
  const newest = [...entries].reverse();
  const active = entries.filter((entry) => !entry.retracted).length;
  const samples = entries.some((entry) => entry.sample);
  return (
    <section aria-labelledby="tonight-heading" data-enter className={className}>
      <Card className="sm:p-6">
        <PanelHead id="tonight-heading" title="Logget i natt" count={active} />
        {newest.length === 0 ? (
          <p className="mt-3 text-base text-muted">Ingenting logget ennå. Det du logger her, står i overleveringen kl. 06:00.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {newest.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5">
                <div className="flex min-w-0 grow basis-48 flex-col gap-0.5">
                  <p className={cx("text-sm", entry.retracted && "text-muted line-through")}>{entryText(entry)}</p>
                  <p className="text-xs text-muted">
                    {entryStamp(entry, now)}
                    {entry.kind === "hazard" && !entry.retracted && signPhrase(entry) ? ` · ${signPhrase(entry)}` : ""}
                    {entry.sample ? " · eksempel" : ""}
                    {entry.retracted ? " · angret" : ""}
                  </p>
                </div>
                {!entry.retracted && (
                  <div className="-mr-3 flex items-center gap-1">
                    {entry.kind === "hazard" && entry.signed === false && (
                      <Button variant="secondary" size="sm" onClick={() => onSign(entry.id)} aria-label={`Skilt satt ut: ${entryText(entry)}`}>
                        Skilt satt ut
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => onUndo(entry.id)} aria-label={`Angre: ${entryText(entry)}`}>
                      Angre
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">
          Lagres på denne enheten i {RETENTION_DAYS} dager.{samples ? " Eksemplene er testdata: en nattevakts natt, skrevet av teamet." : ""} Angre legger til en linje, den sletter ingenting.
        </p>
      </Card>
    </section>
  );
}
