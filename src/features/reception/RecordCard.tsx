"use client";

import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { Badge, type BadgeTone, Button, Card } from "@/ui";
import { formatClock, formatDate } from "./format";
import { ROOM_TYPES } from "./hotel";
import type { BookingRecord, MessageRecord, MessageTopic, ReceptionRecord } from "./records";
import type { StaffMark } from "./useStaffMarks";

const TOPIC: Record<MessageTopic, string> = {
  booking: "Booking",
  question: "Spørsmål",
  complaint: "Klage",
  lost_item: "Glemt gjenstand",
  other: "Annet",
};

function roomName(id: string): string {
  return ROOM_TYPES.find((room) => room.id === id)?.name ?? id;
}

const KR = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

/**
 * One booking or message the receptionist took down, with the staff tick that settles it. A tick can
 * be taken back with Angre, and focus stays in the card's actions while the buttons swap.
 */
export function RecordCard({
  record,
  mark,
  onMark,
}: {
  record: ReceptionRecord;
  mark: StaffMark | undefined;
  onMark: (value: StaffMark | null) => void;
}) {
  const actions = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    actions.current?.querySelector("button")?.focus();
  }, [mark]);
  const settle = (value: StaffMark | null) => {
    refocus.current = true;
    onMark(value);
  };
  return record.kind === "booking" ? (
    <BookingCard record={record} mark={mark} onMark={settle} actionsRef={actions} />
  ) : (
    <MessageCard record={record} mark={mark} onMark={settle} actionsRef={actions} />
  );
}

type CardProps<R> = {
  record: R;
  mark: StaffMark | undefined;
  onMark: (value: StaffMark | null) => void;
  actionsRef: RefObject<HTMLDivElement | null>;
};

function Shell({
  id,
  title,
  badge,
  createdAt,
  children,
  actions,
  actionsRef,
}: {
  id: string;
  title: ReactNode;
  badge: { tone: BadgeTone; label: string };
  createdAt: string;
  children: ReactNode;
  actions: ReactNode;
  actionsRef: RefObject<HTMLDivElement | null>;
}) {
  const headingId = `record-${id}`;
  const clock = formatClock(createdAt);
  return (
    <Card role="article" aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="text-xl font-bold tracking-[-0.02em] break-words">
            {title}
          </h3>
          {clock && (
            <p className="mt-0.5 text-sm text-muted">
              Mottatt <span className="font-mono tabular-nums">{clock}</span>
            </p>
          )}
        </div>
        {/* Announced when a tick changes it. */}
        <span aria-live="polite">
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </span>
      </div>
      {children}
      <div ref={actionsRef} className="flex flex-wrap gap-3">
        {actions}
      </div>
    </Card>
  );
}

function Field({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono tabular-nums break-words" : "min-w-0 break-words"}>{children}</dd>
    </>
  );
}

function BookingCard({ record, mark, onMark, actionsRef }: CardProps<BookingRecord>) {
  const badge: { tone: BadgeTone; label: string } =
    mark === "bekreftet"
      ? { tone: "success", label: "Bekreftet" }
      : mark === "avvist"
        ? { tone: "danger", label: "Avvist" }
        : { tone: "warning", label: "Venter" };
  return (
    <Shell
      id={record.id}
      title="Bookingforespørsel"
      badge={badge}
      createdAt={record.createdAt}
      actionsRef={actionsRef}
      actions={
        mark === "bekreftet" || mark === "avvist" ? (
          <Button variant="ghost" onClick={() => onMark(null)}>
            Angre
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onMark("bekreftet")}>
              Bekreft
            </Button>
            <Button variant="ghost" onClick={() => onMark("avvist")}>
              Avvis
            </Button>
          </>
        )
      }
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-base">
        <Field label="Gjest">{record.name}</Field>
        <Field label="Telefon" mono>
          {record.phone}
        </Field>
        <Field label="Rom">{roomName(record.room)}</Field>
        <Field label="Ankomst" mono>
          {formatDate(record.arrival)}
        </Field>
        <Field label="Avreise" mono>
          {formatDate(record.departure)}
        </Field>
        <Field label="Gjester" mono>
          {record.guests}
        </Field>
        <Field label="Pris direkte" mono>
          <span className="whitespace-nowrap">{KR.format(record.directTotal)} kr</span>
        </Field>
        {record.note && <Field label="Merknad">{record.note}</Field>}
      </dl>
    </Shell>
  );
}

function MessageCard({ record, mark, onMark, actionsRef }: CardProps<MessageRecord>) {
  const badge: { tone: BadgeTone; label: string } = mark
    ? { tone: "success", label: "Ringt tilbake" }
    : record.urgent
      ? { tone: "danger", label: "Haster" }
      : { tone: "warning", label: "Ring tilbake" };
  return (
    <Shell
      id={record.id}
      title={
        <>
          Beskjed <span className="font-semibold text-muted">· {TOPIC[record.topic] ?? TOPIC.other}</span>
        </>
      }
      badge={badge}
      createdAt={record.createdAt}
      actionsRef={actionsRef}
      actions={
        mark ? (
          <Button variant="ghost" onClick={() => onMark(null)}>
            Angre
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => onMark("ringt")}>
            Ringt tilbake
          </Button>
        )
      }
    >
      <p className="text-base break-words text-text">{record.message}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-base">
        <Field label="Gjest">{record.name}</Field>
        <Field label="Telefon" mono>
          {record.phone}
        </Field>
      </dl>
    </Shell>
  );
}
