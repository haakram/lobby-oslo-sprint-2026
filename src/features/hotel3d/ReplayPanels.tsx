"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  itemName,
  placeName,
  type ReplayEvent,
  ROOM_STATUS_LABEL,
  simToClock,
  type Snapshot,
  type WorkOrder,
  workOrderType,
} from "@/features/replay";
import { Badge, type BadgeTone, Card, cx, fadeRise, RegenIcon } from "@/ui";

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
          <p className="text-xl font-bold tracking-[-0.02em]">{task.title}</p>
          {task.text && <p className="text-base text-muted">«{task.text}»</p>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-muted">Siden</dt>
              <dd className="font-mono tabular-nums">{simToClock(task.since, false)}</dd>
            </div>
            {task.room && (
              <div>
                <dt className="text-muted">{placeName(task.room)}</dt>
                <dd>{ROOM_STATUS_LABEL[room?.status ?? "ukjent"]}</dd>
              </div>
            )}
          </dl>
        </>
      ) : (
        <>
          <p className="text-xl font-bold tracking-[-0.02em]">
            {finished ? "Skiftet er ferdig" : robot?.node === "charging-dock" ? "Lader" : "Ingen oppgave nå"}
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
      <h2 id={id} className="text-xl font-bold tracking-[-0.02em]">
        {title}
      </h2>
      {events.length === 0 ? (
        <p className="mt-3 text-base text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {events.map((event) => (
              <motion.li
                key={event.id}
                layout={!reduced}
                variants={variants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-md border border-line bg-surface px-4 py-3 sm:grid-cols-[auto_auto_1fr]"
              >
                <span className="pt-0.5 font-mono text-xs tabular-nums whitespace-nowrap text-muted">{event.clock}</span>
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

const ORDER_TONE: Record<string, BadgeTone> = {
  stoy: "warning",
  sol: "danger",
  teknisk: "danger",
  gjesteklage: "warning",
  annet: "neutral",
};

/** Overnight faults for the morning: one list, newest first. */
export function WorkOrderList({ orders, className }: { orders: WorkOrder[]; className?: string }) {
  const shown = [...orders].reverse();
  return (
    <section aria-labelledby="work-orders" className={className}>
      <div className="flex items-baseline gap-3">
        <h2 id="work-orders" className="text-xl font-bold tracking-[-0.02em]">
          Arbeidsordre
        </h2>
        <span className="font-mono text-sm tabular-nums text-muted">{orders.length}</span>
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 text-base text-muted">Ingen avvik meldt ennå.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {shown.map((order) => (
            <li key={order.id} className="flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-3">
              <RegenIcon name="alert-triangle" className="mt-0.5 size-5 shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ORDER_TONE[order.type] ?? "neutral"}>{workOrderType(order.type)}</Badge>
                  <span className="text-sm text-muted">{placeName(order.room ?? order.place)}</span>
                  <span className="ml-auto font-mono text-xs tabular-nums whitespace-nowrap text-muted">{order.clock.slice(0, 5)}</span>
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
