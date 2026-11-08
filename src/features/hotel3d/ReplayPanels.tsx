"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  itemName,
  nodeFloor,
  placeName,
  type ReplayEvent,
  type RoomStatus,
  simToClock,
  type Snapshot,
  type Timeline,
  type WorkOrder,
  workOrderType,
} from "@/features/replay";
import { heldLine } from "@/features/rooms/RoomChecksPanel";
import { AvvikMark, Badge, type BadgeTone, Button, Card, cx, fadeRise, RegenIcon, RoomStatusTag } from "@/ui";
import { isRoomStatusKey, ROOM_STATUS } from "@/ui/roomStatus";
import { HELD_WORD, heldOf, roomWord } from "./held";

/** The replay's status as the shared room-status key (avvik is a mark, not a status). */
function statusKey(status: RoomStatus) {
  return isRoomStatusKey(status) ? status : "ukjent";
}

/** The rack's "Holdt tilbake" as a key tag: the taken (opptatt) look, never the green of Klar. */
function HeldTag() {
  const look = ROOM_STATUS.opptatt;
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap", look.ink)}>
      <span aria-hidden="true" className={cx("h-1.5 w-5 shrink-0 rounded-full", look.tag)} />
      {HELD_WORD}
    </span>
  );
}

/** One room, as the night has seen it so far: status, the robot's visits, open faults. */
export function RoomCard({
  roomId,
  snapshot,
  timeline,
  onClose,
  className,
}: {
  roomId: string;
  snapshot: Snapshot;
  timeline: Timeline | null;
  onClose: () => void;
  className?: string;
}) {
  const room = snapshot.rooms[roomId];
  const status = room?.status ?? "ukjent";
  // Held back by the room check (held.ts): taken, in the rack's words, with the catch the robot made.
  const held = heldOf(room);
  const tasks = (timeline?.tasks ?? []).filter((task) => task.room === roomId && task.start <= snapshot.t);
  const requests = new Set(tasks.map((task) => task.id));
  const roomWord = `rom ${roomId.replace(/^room-/, "")}`;
  const events = (timeline?.events ?? [])
    .slice(0, snapshot.eventCount)
    .filter((event) => (event.request && requests.has(event.request)) || event.text.toLowerCase().includes(roomWord))
    .slice(-6)
    .reverse();
  const orders = snapshot.workOrders.filter((order) => order.room === roomId);

  return (
    <Card className={cx("flex flex-col gap-3", className)} aria-labelledby="room-card" data-room={roomId}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="room-card" className="text-lg font-semibold tracking-[-0.01em]">
            {placeName(roomId)}
          </h2>
          <p className="text-sm text-muted">{nodeFloor(roomId)}. etasje</p>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label={`Lukk ${placeName(roomId)}`}>
          Lukk
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* The same tag as the key rack on Rom (src/ui/roomStatus.ts), and the avvik as its quiet mark. */}
        {held ? <HeldTag /> : <RoomStatusTag status={statusKey(status)} />}
        <AvvikMark count={orders.length} />
        {room?.since !== null && room?.since !== undefined && (
          <span className="font-mono text-sm tabular-nums text-muted">siden {simToClock(room.since, false)}</span>
        )}
      </div>
      {room?.note && <p className="text-base text-muted">{room.note}</p>}
      {held && <p className="text-base">{heldLine(held)}</p>}
      {orders.length > 0 && (
        <ul aria-label="Arbeidsordre for rommet" className="flex flex-col gap-1">
          {orders.map((order) => (
            <li key={order.id} className="flex items-start gap-2 text-sm">
              <RegenIcon name="alert-triangle" className="mt-0.5 size-4 shrink-0 text-muted" />
              <span>
                <Badge tone="neutral" className="mr-2">
                  {workOrderType(order.type)}
                </Badge>
                {order.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div>
        <h3 className="text-sm font-semibold text-muted">
          Oppgaver <span className="font-mono tabular-nums">{tasks.length}</span>
        </h3>
        {tasks.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Roboten har ikke hatt noe her ennå.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {[...tasks].reverse().map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-sm tabular-nums text-muted sm:text-xs">{simToClock(task.start, false)}</span>
                <Badge tone={task.outcome === "done" ? "success" : task.outcome === "failed" ? "danger" : "accent"}>
                  {task.outcome === "done" ? "Fullført" : task.outcome === "failed" ? "Feilet" : "Pågår"}
                </Badge>
                <span className="min-w-0 break-words">{task.text || task.id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {events.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted">Sist her</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {events.map((event) => (
              <li key={event.id} className="flex items-start gap-2 text-sm">
                <span className="pt-0.5 font-mono text-sm tabular-nums text-muted sm:text-xs">{event.clock.slice(0, 5)}</span>
                <span className="min-w-0 break-words">
                  <span className="font-semibold">{event.label}</span> · {event.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** The robot's task right now: the one card a manager reads first. */
export function TaskCard({ snapshot, finished, className }: { snapshot: Snapshot | null; finished?: boolean; className?: string }) {
  const task = snapshot?.robot.task ?? null;
  const robot = snapshot?.robot ?? null;
  const room = task?.room ? snapshot?.rooms[task.room] : undefined;

  return (
    <Card className={cx("flex flex-col gap-3", className)} aria-labelledby="task-now">
      <div className="flex items-center justify-between gap-3">
        <h2 id="task-now" className="text-sm font-semibold text-muted">
          Oppgave nå
        </h2>
        {task && <Badge tone="accent">{task.kindLabel}</Badge>}
      </div>
      {task ? (
        <>
          <p className="text-lg font-semibold tracking-[-0.01em]">{task.title.replace(/^[^·]+·\s*/, "")}</p>
          {task.text && <p className="text-base text-muted">«{task.text}»</p>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-muted">Siden</dt>
              <dd className="font-mono tabular-nums">{simToClock(task.since, false)}</dd>
            </div>
            {task.room && (
              <div>
                <dt className="text-muted">{placeName(task.room)}</dt>
                <dd>{roomWord(room)}</dd>
              </div>
            )}
          </dl>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold tracking-[-0.01em]">
            {finished ? "Skiftet er ferdig" : robot?.node === "charging-dock" ? "Lader" : "Venter på oppgave"}
          </p>
          <p className="text-base text-muted">{robot ? `Roboten står ved ${placeName(robot.node).toLowerCase()}.` : "Venter på skiftet."}</p>
        </>
      )}
      {robot && robot.carrying.length > 0 && (
        <ul aria-label="Har med" className="flex flex-wrap gap-1.5">
          {robot.carrying.map((item, index) => (
            <li key={`${item}-${index}`}>
              <Badge tone="neutral">{itemName(item)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The feed of what the robot did and decided, newest first. */
export function EventFeed({
  events,
  title,
  emptyText,
  id,
  className,
}: {
  events: ReplayEvent[];
  title: string;
  emptyText: string;
  id: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const variants = fadeRise(reduced);

  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className={title ? "text-lg font-semibold tracking-[-0.01em]" : "sr-only"}>
        {title || "Hendelser"}
      </h2>
      {events.length === 0 ? (
        <p className="mt-3 text-base text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          <AnimatePresence initial={false}>
            {events.map((event) => (
              <motion.li
                key={event.id}
                layout={!reduced}
                variants={variants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 border-t border-line px-1 py-3 first:border-t-0 sm:grid-cols-[auto_auto_1fr]"
              >
                <span className="pt-0.5 font-mono text-sm tabular-nums whitespace-nowrap text-muted sm:text-xs">{event.clock.slice(0, 5)}</span>
                <Badge tone={event.tone as BadgeTone} className="justify-self-start">
                  {event.label}
                </Badge>
                <span className="col-span-2 min-w-0 text-base break-words sm:col-span-1">{event.text || "Uten detaljer"}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

// Categories are neutral; green, amber and red mean state only (DESIGN.md).
const ORDER_TONE: Record<string, BadgeTone> = {};

/** Overnight faults for the morning: one list, newest first. */
export function WorkOrderList({ orders, className }: { orders: WorkOrder[]; className?: string }) {
  const shown = [...orders].reverse();
  return (
    <section aria-labelledby="work-orders" className={className}>
      <div className="flex items-baseline gap-3">
        <h2 id="work-orders" className="text-lg font-semibold tracking-[-0.01em]">
          Arbeidsordre
        </h2>
        <span className="text-sm tabular-nums text-muted">{orders.length}</span>
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 text-base text-muted">Ingen avvik meldt ennå.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {shown.map((order) => (
            <li key={order.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ORDER_TONE[order.type] ?? "neutral"}>{workOrderType(order.type)}</Badge>
                  <span className="text-sm text-muted">{placeName(order.room ?? order.place)}</span>
                  <span className="ml-auto font-mono text-sm tabular-nums whitespace-nowrap text-muted sm:text-xs">{order.clock.slice(0, 5)}</span>
                </div>
                <p className="mt-1 text-base break-words">{order.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
