"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { placeLabel } from "@/features/dashboard/labels";
import type { OrderStatus } from "@/features/dashboard/selectors";
import { useNight } from "@/features/dashboard/useNight";
import { useOrderStatuses } from "@/features/dashboard/useOrderStatuses";
import { useReceptionCalls } from "@/features/dashboard/useReceptionCalls";
import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { type DataSource, SourceNote } from "@/features/modules/SourceNote";
import { osloToday } from "@/features/reception/dates";
import { type DemoCall, demoCalls } from "@/features/reception/demoCalls";
import { formatClock } from "@/features/reception/format";
import { useStoredRecords } from "@/features/reception/useStoredRecords";
import { ROOM_CHECK_MARKS } from "@/features/rooms/reconcile";
import { Badge, Button, Card, cx, EmptyState, ErrorState, Skeleton, Stat } from "@/ui";
import { CallSheet } from "./CallSheet";
import { assignPhoneTask, PHONE_ASSIGNMENTS, type PhoneTask, phoneTasks } from "./phoneTasks";
import {
  countRequests,
  fromRoomCheck,
  orderStatusOf,
  REQUEST_ORDER,
  REQUEST_STATUS,
  type RequestSource,
  type RequestStatus,
  type RequestView,
  selectRequests,
  SOURCE_WORD,
} from "./select";
import { focusAction, UndoStatus } from "./UndoStatus";

const DONE_SHOWN = 8;
const SOURCES: readonly RequestSource[] = ["telefon", "stemme", "personale", "robot"];

const GROUP_TITLE: Record<RequestStatus, string> = {
  venter: "Venter på noen",
  feilet: "Roboten fikk det ikke til",
  pagar: "Pågår",
  fullfort: "Fullført",
};

/** The one step a row offers: take a waiting request, take over what the robot failed, close it. */
const VERB: Record<Exclude<RequestStatus, "fullfort">, string> = {
  venter: "Ta saken",
  feilet: "Ta over",
  pagar: "Marker fullført",
};

/** What the last action did, so the status line can say it and *Angre* can put it back exactly. */
type Last = {
  key: number;
  id: string;
  what: string;
  to: RequestStatus;
  previous: OrderStatus | undefined;
  /** Said instead of "står nå under …" (a phone task sent to the robot or a person). */
  message?: string;
  /** The phone task whose assignment *Angre* takes back. */
  assigned?: string;
};

function describe(request: RequestView): string {
  return [request.kind, request.room ? placeLabel(request.room) : null].filter(Boolean).join(", ");
}

/**
 * Forespørsler: everything guests asked for, from every source, with who has it and how it went.
 * Waiting first. Staff move the phone, voice and staff requests along, and take over what the
 * robot failed or left open; the robot reports the rest itself.
 */
export function RequestsScreen({ viewerUrl, demo, today: day }: { viewerUrl?: string; demo?: readonly DemoCall[]; today?: string }) {
  const { statuses, statusOf, advance, undo, restore } = useOrderStatuses();
  const { run, night } = useNight(viewerUrl);
  const { state: calls, retry: retryCalls } = useReceptionCalls();
  const today = day ?? osloToday();
  // What the AI receptionist took down in this browser, and last night's seeded calls (TODO(phase-3)).
  const { records } = useStoredRecords();
  const seeded = useMemo(() => demo ?? demoCalls(today), [demo, today]);
  const liveCalls = calls.kind === "ready" ? calls.calls : null;
  const tasks = useMemo(() => phoneTasks(records, seeded, liveCalls ?? []), [records, seeded, liveCalls]);
  const assignments = PHONE_ASSIGNMENTS.use();
  const roomChecks = ROOM_CHECK_MARKS.use()[today];
  const extra = useMemo(
    () => Object.entries(roomChecks ?? {}).flatMap(([room, mark]) => (mark.action === "task" ? [fromRoomCheck(today, room, mark)] : [])),
    [roomChecks, today],
  );
  const [call, setCall] = useState<{ task: PhoneTask; open: boolean } | null>(null);
  const [source, setSource] = useState<RequestSource | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [last, setLast] = useState<Last | null>(null);
  const seq = useRef(0);
  const card = useRef<HTMLDivElement>(null);
  const refocus = useRef<string | null>(null);

  // After Angre the row is back in its old group: its action gets the focus again.
  useEffect(() => {
    if (!refocus.current) return;
    focusAction(card.current, refocus.current);
    refocus.current = null;
  });

  const requests = useMemo(
    () => selectRequests({ night, calls: calls.kind === "ready" ? calls.calls : null, statusOf, phone: tasks, assignments, extra }),
    [night, calls, statusOf, tasks, assignments, extra],
  );
  const counts = countRequests(requests);
  const shown = source ? requests.filter((request) => request.source === source) : requests;
  const runLoading = run.status === "loading";
  const loading = runLoading || calls.kind === "loading";
  const phoneDown = calls.kind === "error" || calls.kind === "not-set-up";
  // Only the sources that actually answered are named under the list.
  const livePhone = tasks.some((task) => task.origin !== "demo");
  const sources: DataSource[] = [...(run.status === "ready" ? (["run-log"] as const) : []), ...(calls.kind === "ready" || livePhone ? (["reception"] as const) : []), "test", "local"];
  // The robot's requests are in every figure: until the night is in, the figures wait too.
  const figure = (value: number) => (runLoading ? <Skeleton className="inline-block h-7 w-10 align-middle" /> : value);

  const remember = (request: RequestView, to: RequestStatus, extra?: Pick<Last, "message" | "assigned">) => {
    seq.current += 1;
    setLast({ key: seq.current, id: request.id, what: describe(request), to, previous: statuses[request.id] as OrderStatus | undefined, ...extra });
  };
  /** One tap: the robot or the person on shift takes a phone task; it moves to Pågår. */
  const onAssign = (request: RequestView, to: "robot" | "staff") => {
    const task = request.phone;
    if (!task) return;
    const who = to === "robot" ? "Roboten" : task.staff.name;
    const what = describe(request);
    remember(request, "pagar", { message: to === "robot" ? `${what} er sendt til roboten.` : `${what} er gitt til ${who}.`, assigned: task.id });
    assignPhoneTask(task.id, { to, who, at: formatClock(new Date().toISOString()) });
    advance(request.id, "ny");
  };
  const onAdvance = (request: RequestView) => {
    const from = orderStatusOf(request);
    remember(request, from === "ny" ? "pagar" : "fullfort");
    advance(request.id, from);
  };
  const onReopen = (request: RequestView) => {
    remember(request, "pagar");
    undo(request.id);
  };
  const undoLast = () => {
    if (!last) return;
    restore(last.id, last.previous);
    if (last.assigned) assignPhoneTask(last.assigned, null);
    refocus.current = last.id;
    setLast(null);
  };

  return (
    <ModulePage module="foresporsler" ready={!loading} lede="Alt gjestene ber om, fra telefon, robot, personale og stemme. Det som venter på noen står først.">
      <FigureRow label="Forespørslene i tall">
        {/* What got done first, in green; the rest are plain counts (what needs a person is in the bell). */}
        <Stat label="Fullført" value={figure(counts.fullfort)} tone={runLoading ? "default" : "success"} />
        <Stat label="Pågår" value={figure(counts.pagar)} />
        <Stat label="Venter" value={figure(counts.venter)} />
        <Stat label="Feilet" value={figure(counts.feilet)} />
      </FigureRow>

      {run.status === "error" && (
        <ErrorState
          title="Fikk ikke lastet natten"
          body="Robotens forespørsler vises ikke før natteloggen svarer. Telefon, stemme og personale står under."
          action={
            <Button variant="secondary" onClick={run.retry} aria-label="Prøv igjen å laste natten">
              Prøv igjen
            </Button>
          }
        />
      )}
      {calls.kind === "error" && (
        <ErrorState
          title="Fikk ikke hentet telefonen"
          body="Samtaler som skal ringes tilbake, vises ikke her. Sjekk Resepsjon, eller prøv igjen."
          action={
            <Button variant="secondary" onClick={retryCalls} aria-label="Prøv igjen å hente telefonen">
              Prøv igjen
            </Button>
          }
        />
      )}

      <section aria-labelledby="requests-heading" data-enter>
        <Card className="sm:p-6">
          <div ref={card}>
            <PanelHead
              id="requests-heading"
              title="Alle forespørsler"
              count={shown.length}
              action={
                <div role="group" aria-label="Kilde" className="flex flex-wrap gap-1">
                  <Chip pressed={source === null} onClick={() => setSource(null)}>
                    Alle
                  </Chip>
                  {SOURCES.map((id) => (
                    <Chip key={id} pressed={source === id} onClick={() => setSource(id)}>
                      {SOURCE_WORD[id]}
                    </Chip>
                  ))}
                </div>
              }
            />

            {calls.kind === "not-set-up" && (
              <p className="mt-3 text-sm text-muted">Telefonen er ikke med i listen: resepsjonisten er ikke koblet til ennå.</p>
            )}

            {last && (
              <UndoStatus key={last.key} className="mt-3" message={last.message ?? `${last.what} står nå under ${GROUP_TITLE[last.to]}.`} onUndo={undoLast} undoLabel={`Angre: ${last.what}`} />
            )}

            {shown.length === 0 ? (
              loading ? (
                <LoadingRows rows={3} label={runLoading ? "Henter robotens natt" : "Henter telefonen"} />
              ) : (
                <EmptyState
                  className="mt-4"
                  title="Ingen forespørsler"
                  body={
                    source === "telefon" && phoneDown
                      ? calls.kind === "not-set-up"
                        ? "Resepsjonisten er ikke koblet til ennå."
                        : "Fikk ikke hentet telefonen. Prøv igjen over."
                      : source === "robot" && run.status === "error"
                        ? "Fikk ikke lastet natten. Prøv igjen over."
                        : source
                          ? `Ingen fra ${SOURCE_WORD[source].toLowerCase()} i dag.`
                          : "Når gjester ber om noe, står det her med kilde, rom og hvem som har saken."
                  }
                />
              )
            ) : (
              <>
                {REQUEST_ORDER.map((status) => {
                  const inGroup = shown.filter((request) => request.status === status);
                  if (inGroup.length === 0) return null;
                  // The row that just moved stands first in its new group, so it (and its Angre) is in view.
                  const group = last ? [...inGroup.filter((r) => r.id === last.id), ...inGroup.filter((r) => r.id !== last.id)] : inGroup;
                  const limited = status === "fullfort" && !allDone ? group.slice(0, DONE_SHOWN) : group;
                  return (
                    <div key={status} className="mt-5 first:mt-3">
                      <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                        {GROUP_TITLE[status]}
                        <span className="font-normal text-muted tabular-nums">{group.length}</span>
                      </h3>
                      <ol className="mt-1 divide-y divide-line">
                        {limited.map((request) => (
                          <Row
                            key={request.id}
                            request={request}
                            onAdvance={onAdvance}
                            onReopen={onReopen}
                            onAssign={onAssign}
                            onOpenCall={(task) => setCall({ task, open: true })}
                          />
                        ))}
                      </ol>
                      {status === "fullfort" && group.length > DONE_SHOWN && (
                        <Button variant="ghost" size="sm" className="-ml-3 mt-1" onClick={() => setAllDone((value) => !value)} aria-expanded={allDone}>
                          {allDone ? "Vis færre" : `Vis alle ${group.length}`}
                        </Button>
                      )}
                    </div>
                  );
                })}
                {loading && <LoadingRows rows={1} label={runLoading ? "Henter robotens natt" : "Henter telefonen"} />}
              </>
            )}
            <SourceNote className="mt-4" sources={sources} />
          </div>
        </Card>
      </section>
      <CallSheet task={call?.task ?? null} open={call?.open ?? false} onClose={() => setCall((current) => (current ? { ...current, open: false } : null))} />
    </ModulePage>
  );
}

/** Rows still on their way, under the ones already here, in the shape of a row. */
function LoadingRows({ rows, label }: { rows: number; label: string }) {
  return (
    <div role="status" aria-busy="true" className="mt-4 flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        "min-h-10 rounded-md px-3 text-sm font-medium transition-colors duration-[120ms] ease-standard pointer-coarse:min-h-11",
        pressed ? "bg-text text-bg" : "bg-sunken text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function Row({
  request,
  onAdvance,
  onReopen,
  onAssign,
  onOpenCall,
}: {
  request: RequestView;
  onAdvance: (request: RequestView) => void;
  onReopen: (request: RequestView) => void;
  onAssign: (request: RequestView, to: "robot" | "staff") => void;
  onOpenCall: (task: PhoneTask) => void;
}) {
  const look = REQUEST_STATUS[request.status];
  const where = request.room ? placeLabel(request.room) : null;
  const named = `${request.kind}${where ? `, ${where}` : ""}`;
  const phone = request.phone;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm whitespace-nowrap text-muted tabular-nums">
            {request.at ?? "–"}
            {request.tonight && <span className="ml-1 text-sm sm:text-xs">i natt</span>}
          </span>
          <span className="font-semibold">{request.kind}</span>
          {where && <span className="text-sm text-muted">{where}</span>}
          <Badge tone="neutral">{request.badge ?? SOURCE_WORD[request.source]}</Badge>
        </div>
        {request.text && (
          <p lang={request.lang ?? undefined} className={cx("text-sm", request.lang === "en" ? "text-muted" : "text-text")}>
            {request.lang === "en" ? `«${request.text}»` : request.text}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
          <span>{request.handler}</span>
          {phone && (
            <button
              type="button"
              onClick={() => onOpenCall(phone)}
              className="-my-2 inline-flex min-h-10 items-center font-semibold text-accent-text hover:underline pointer-coarse:min-h-11"
              aria-label={`Se samtalen: ${named}`}
            >
              Se samtalen
            </button>
          )}
        </p>
      </div>
      <div className={cx("flex shrink-0 flex-wrap items-center gap-3 sm:justify-end", phone && request.status === "venter" ? "sm:w-auto" : "sm:w-56")}>
        <Badge tone={look.tone}>{look.word}</Badge>
        {phone && request.status === "venter" ? (
          <AssignButtons request={request} task={phone} named={named} onAssign={onAssign} />
        ) : request.actionable &&
          (request.status === "fullfort" ? (
            <Button variant="ghost" size="sm" data-action-for={request.id} onClick={() => onReopen(request)} aria-label={`Angre fullført: ${named}`}>
              Angre
            </Button>
          ) : (
            <Button variant="secondary" size="sm" data-action-for={request.id} onClick={() => onAdvance(request)} aria-label={`${VERB[request.status]}: ${named}`}>
              {VERB[request.status]}
            </Button>
          ))}
      </div>
    </li>
  );
}

/** A phone task's one tap: the suggested taker first (outlined), the other quiet beside it. */
function AssignButtons({ request, task, named, onAssign }: { request: RequestView; task: PhoneTask; named: string; onAssign: (request: RequestView, to: "robot" | "staff") => void }) {
  const robot = (
    <Button key="robot" variant={task.suggested === "robot" ? "secondary" : "ghost"} size="sm" data-action-for={task.suggested === "robot" ? request.id : undefined} onClick={() => onAssign(request, "robot")} aria-label={`Send roboten: ${named}`}>
      Send roboten
    </Button>
  );
  const staff = (
    <Button
      key="staff"
      variant={task.suggested === "staff" ? "secondary" : "ghost"}
      size="sm"
      data-action-for={task.suggested === "staff" ? request.id : undefined}
      onClick={() => onAssign(request, "staff")}
      aria-label={`Gi til ${task.staff.name}: ${named}`}
    >
      Gi til {task.staff.first}
    </Button>
  );
  if (!task.robotCan) return staff;
  return task.suggested === "robot" ? [robot, staff] : [staff, robot];
}
