"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/features/auth/SessionProvider";
import { placeLabel } from "@/features/dashboard/labels";
import type { OrderStatus } from "@/features/dashboard/selectors";
import { useNight } from "@/features/dashboard/useNight";
import { useOrderStatuses } from "@/features/dashboard/useOrderStatuses";
import { useReceptionCalls } from "@/features/dashboard/useReceptionCalls";
import { FigureRow, ModulePage, PanelHead } from "@/features/modules/ModulePage";
import { type DataSource, SourceNote } from "@/features/modules/SourceNote";
import { declineSplit, declineSplitText } from "@/features/nightshift/declines";
import { osloToday } from "@/features/reception/dates";
import type { DemoCall } from "@/features/reception/demoCalls";
import { formatClock } from "@/features/reception/format";
import { Badge, Button, Card, cx, EmptyState, ErrorState, Skeleton, Stat } from "@/ui";
import { relativeTime, stampNow, useNowMs } from "@/ui/stamp";
import { CallSheet } from "./CallSheet";
import { assignPhoneTask, type PhoneTask } from "./phoneTasks";
import {
  countRequests,
  hotelRoomsOf,
  orderStatusOf,
  REQUEST_LANES,
  REQUEST_STATUS,
  type RequestLane,
  requestLane,
  type RequestSource,
  type RequestStatus,
  type RequestView,
  requestTotals,
  selectRequests,
  SOURCE_WORD,
  SOURCES,
} from "./select";
import { type RequestAct, REQUEST_STAMPS, type RequestStamp, stampRequest } from "./stamps";
import { useRequestInputs } from "./useRequestInputs";
import { focusAction, UndoStatus } from "./UndoStatus";

const DONE_SHOWN = 8;

const LANE_TITLE: Record<RequestLane, string> = {
  handback: "Roboten ga videre",
  phone: "Fra telefonen",
  venter: "Venter på noen",
  pagar: "Pågår",
  fullfort: "Fullført",
  avvist: "Avvist etter sjekk",
  avlyst: "Avlyst av nattsjefen",
};

/** Where a row with this status stands (for "står nå under …"). */
function titleOf(status: RequestStatus): string {
  return LANE_TITLE[status === "feilet" ? "handback" : status];
}

/** The one step a row offers: take a waiting request, take over what the robot failed, close it. */
const VERB: Record<Exclude<RequestStatus, "fullfort" | "avvist" | "avlyst">, string> = {
  venter: "Ta saken",
  feilet: "Ta over",
  pagar: "Marker fullført",
};

/** A refusal is a decision for a person (jury round 3, the Wybe engineer): the verb fits what the robot refused. */
function declineVerb(request: RequestView): string {
  switch (request.decline?.kind) {
    case "noOrder":
    case "alreadyDone":
      return "Gi det likevel";
    case "nothingNew":
      return "Sjekk likevel";
    default:
      return request.kind === "Søl" ? "Sjekk likevel" : "Ta saken likevel";
  }
}

function verbOf(request: RequestView): string | null {
  if (request.status === "avvist") return declineVerb(request);
  return request.status in VERB ? VERB[request.status as keyof typeof VERB] : null;
}

/** What the last action did, so the row can say it and *Angre* can put it back exactly. */
type Last = {
  key: number;
  id: string;
  /** The group the row stood in when it was acted on: it stays there until the next action, so nothing jumps. */
  lane: RequestLane;
  what: string;
  to: RequestStatus;
  previous: OrderStatus | undefined;
  /** The stamp before the action, put back by *Angre*. */
  previousStamp: RequestStamp | undefined;
  /** Said instead of "står nå under …" (a phone task sent to the robot or a person). */
  message?: string;
  /** The phone task whose assignment *Angre* takes back. */
  assigned?: string;
};

function describe(request: RequestView): string {
  return [request.kind, request.room ? placeLabel(request.room) : null].filter(Boolean).join(", ");
}

/** Who has it now: "Siri Haugen tok saken · nå" when someone moved it here, else what the source says. */
function handlerLine(request: RequestView, now: number): string {
  const stamp = request.stamp;
  if (!stamp) return request.handler;
  const when = now > 0 ? relativeTime(stamp.at, now) : null;
  const at = when ? ` · ${when}` : "";
  switch (stamp.act) {
    case "took":
      return `${stamp.who} tok saken${at}`;
    case "gave":
      return `${stamp.who} ga det likevel${at}`;
    case "done":
      return `${stamp.who} markerte fullført${at}`;
    case "reopened":
      return `${stamp.who} åpnet saken igjen${at}`;
    case "assigned":
      return request.assignedTo === "robot"
        ? `${stamp.who} la den i robotens kø${at} · sendes når roboten er koblet til`
        : `${stamp.who} ga den til ${request.assignedTo ?? "en kollega"}${at}`;
  }
}

/** The referee's word on a refusal, after the robot's reason. */
function judgeLine(request: RequestView): string | null {
  switch (request.decline?.judged) {
    case "credited":
      return "Godkjent av dommeren.";
    case "not_credited":
      return "Ikke godkjent av dommeren: se på denne først.";
    case "pending":
      return "Dommeren har ikke svart ennå.";
    default:
      return null;
  }
}

/**
 * Forespørsler: everything guests asked for, from every source, with who has it and how it went.
 * What the robot handed back first (pinned: calls that arrive a moment later go below it), then the
 * phone, then the rest. Staff take what waits, close what's under way, and decide on what the robot
 * refused; the robot reports the rest itself.
 */
export function RequestsScreen({
  viewerUrl,
  demo,
  today: day,
  initialSource = null,
}: {
  viewerUrl?: string;
  demo?: readonly DemoCall[];
  today?: string;
  /** The source the list opens on (`?filter=robot`). */
  initialSource?: RequestSource | null;
}) {
  const { user } = useSession();
  const { statuses, statusOf, advance, undo, restore } = useOrderStatuses();
  const { run, night, map } = useNight(viewerUrl);
  const { state: calls, retry: retryCalls } = useReceptionCalls();
  const today = day ?? osloToday();
  // What the AI receptionist took down (this browser, last night's seeded calls) and Rom's tasks: the same inputs Oversikt reads.
  const liveCalls = calls.kind === "ready" ? calls.calls : null;
  const { phone: tasks, assignments, extra } = useRequestInputs({ today, demo, calls: liveCalls });
  const stamps = REQUEST_STAMPS.use();
  const now = useNowMs();
  const [call, setCall] = useState<{ task: PhoneTask; open: boolean } | null>(null);
  const [source, setSource] = useState<RequestSource | null>(initialSource);
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

  const runReady = run.status === "ready";
  const hotelRooms = useMemo(() => hotelRoomsOf(map, Boolean(night?.ended)), [map, night]);
  const declines = useMemo(() => (runReady ? declineSplit(run.lines) : null), [runReady, run.lines]);
  const requests = useMemo(
    () => selectRequests({ night, calls: liveCalls, statusOf, phone: tasks, assignments, extra, hotelRooms, stamps, declines }),
    [night, liveCalls, statusOf, tasks, assignments, extra, hotelRooms, stamps, declines],
  );
  const counts = countRequests(requests);
  const totals = requestTotals(requests);
  const shown = source ? requests.filter((request) => request.source === source) : requests;
  const runLoading = run.status === "loading";
  const phoneDown = calls.kind === "error" || calls.kind === "not-set-up";
  // The phone's own place in the list: held while its calls are on their way, so they never push the robot's rows.
  const phoneSlot = source === null || source === "telefon";
  // Only the sources that actually answered are named under the list.
  const livePhone = tasks.some((task) => task.origin !== "demo");
  const sources: DataSource[] = [...(runReady ? (["run-log"] as const) : []), ...(calls.kind === "ready" || livePhone ? (["reception"] as const) : []), "test", "local"];
  // The robot's requests are in every figure: until the night is in, the figures wait too.
  const figure = (value: number) => (runLoading ? <Skeleton className="inline-block h-7 w-10 align-middle" /> : value);
  // The refusals the referee judged, and how many of them someone has given anyway since.
  const given = requests.filter((request) => request.decline && request.status !== "avvist").length;
  const split = declines && declines.total > 0 ? `${declineSplitText(declines)}${given > 0 ? ` · ${given} gitt likevel` : ""}.` : null;

  const pickSource = (next: RequestSource | null) => {
    setSource(next);
    // The address keeps the filter, so a reload or a shared link opens on the same list.
    try {
      window.history.replaceState(window.history.state, "", next ? `?filter=${next}` : window.location.pathname);
    } catch {
      // No history (a test or an old browser): the filter still holds on this page.
    }
  };

  const stamp = (request: RequestView, act: RequestAct) => stampRequest(request.id, { act, who: user?.name ?? "Personalet", at: stampNow() });
  const remember = (request: RequestView, to: RequestStatus, extra?: Pick<Last, "message" | "assigned">) => {
    seq.current += 1;
    setLast({
      key: seq.current,
      id: request.id,
      lane: requestLane(request),
      what: describe(request),
      to,
      previous: statuses[request.id] as OrderStatus | undefined,
      previousStamp: stamps[request.id],
      ...extra,
    });
  };
  /** One tap: the robot or the person on shift takes a phone task; it moves to Pågår. */
  const onAssign = (request: RequestView, to: "robot" | "staff") => {
    const task = request.phone;
    if (!task) return;
    const who = to === "robot" ? "Roboten" : task.staff.name;
    const what = describe(request);
    // TODO(phase-3): no connection to the robot yet; the task waits in its queue in this browser, and the line says so.
    remember(request, "pagar", { message: to === "robot" ? `${what} er lagt i robotens kø. Den sendes når roboten er koblet til.` : `${what} er gitt til ${who}.`, assigned: task.id });
    assignPhoneTask(task.id, { to, who, at: formatClock(new Date().toISOString()) });
    stamp(request, "assigned");
    advance(request.id, "ny");
  };
  const onAdvance = (request: RequestView) => {
    const from = orderStatusOf(request);
    remember(request, from === "ny" ? "pagar" : "fullfort");
    stamp(request, from === "ny" ? (request.status === "avvist" ? "gave" : "took") : "done");
    advance(request.id, from);
  };
  const onReopen = (request: RequestView) => {
    remember(request, "pagar");
    stamp(request, "reopened");
    undo(request.id);
  };
  const undoLast = () => {
    if (!last) return;
    restore(last.id, last.previous);
    stampRequest(last.id, last.previousStamp ?? null);
    if (last.assigned) assignPhoneTask(last.assigned, null);
    refocus.current = last.id;
    setLast(null);
  };

  const phoneError = (
    <ErrorState
      title="Fikk ikke hentet telefonen"
      body="Samtaler som skal ringes tilbake, vises ikke her. Sjekk Resepsjon, eller prøv igjen."
      action={
        <Button variant="secondary" onClick={retryCalls} aria-label="Prøv igjen å hente telefonen">
          Prøv igjen
        </Button>
      }
    />
  );
  // What stands in the phone's place besides its rows: its calls on their way, a failure, or no receptionist.
  const phoneNotice =
    !phoneSlot ? null : calls.kind === "loading" ? (
      <LoadingRows rows={1} label="Henter telefonen" />
    ) : calls.kind === "error" ? (
      <div className="mt-2">{phoneError}</div>
    ) : calls.kind === "not-set-up" ? (
      <p className="mt-1 text-sm text-muted">Telefonen er ikke med i listen: resepsjonisten er ikke koblet til ennå.</p>
    ) : null;

  return (
    <ModulePage module="foresporsler" ready={!runLoading} lede="Alt gjestene ber om, fra telefon, robot, personale og stemme. Det roboten ga videre står først.">
      <FigureRow label="Forespørslene i tall">
        {/* What got done first, in green; the rest are plain counts (what needs a person is in the bell). */}
        <Stat label="Fullført" value={figure(totals.done)} unit={runLoading ? undefined : `av ${totals.total}`} tone={runLoading ? "default" : "success"} />
        <Stat label="Venter" value={figure(counts.venter)} />
        <Stat label="Feilet" value={figure(counts.feilet)} />
        {/* Not failures: the robot refused a claim with no order on record, or the night manager called it off. */}
        <Stat label="Avvist eller avlyst" value={figure(totals.declined + totals.cancelled)} />
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

      <section aria-labelledby="requests-heading" data-enter>
        <Card className="sm:p-6">
          <div ref={card}>
            <PanelHead
              id="requests-heading"
              title="Alle forespørsler"
              count={runLoading ? undefined : shown.length}
              action={
                <div role="group" aria-label="Kilde" className="flex flex-wrap gap-1">
                  <Chip pressed={source === null} onClick={() => pickSource(null)}>
                    Alle
                  </Chip>
                  {SOURCES.map((id) => (
                    <Chip key={id} pressed={source === id} onClick={() => pickSource(id)}>
                      {SOURCE_WORD[id]}
                    </Chip>
                  ))}
                </div>
              }
            />

            {runLoading ? (
              // The robot's rows go first: until the night is in, nothing is drawn above where they will stand.
              <LoadingRows rows={3} label="Henter robotens natt" />
            ) : shown.length === 0 ? (
              source === "telefon" && calls.kind === "error" ? (
                <div className="mt-4">{phoneError}</div>
              ) : source === "telefon" && calls.kind === "loading" ? (
                <LoadingRows rows={2} label="Henter telefonen" />
              ) : (
                <EmptyState
                  className="mt-4"
                  title="Ingen forespørsler"
                  body={
                    source === "telefon" && phoneDown
                      ? "Resepsjonisten er ikke koblet til ennå."
                      : source === "robot" && run.status === "error"
                        ? "Fikk ikke lastet natten. Prøv igjen over."
                        : source
                          ? `Ingen fra ${SOURCE_WORD[source].toLowerCase()} i dag.`
                          : "Når gjester ber om noe, står det her med kilde, rom og hvem som har saken."
                  }
                />
              )
            ) : (
              REQUEST_LANES.map((lane) => {
                // The row just acted on stays where it stood until the next action, with its Angre beside it.
                const inLane = shown.filter((request) => (last?.id === request.id ? last.lane : requestLane(request)) === lane);
                const notice = lane === "phone" ? phoneNotice : null;
                if (inLane.length === 0 && !notice) return null;
                const limited = lane === "fullfort" && !allDone ? inLane.slice(0, DONE_SHOWN) : inLane;
                return (
                  <div key={lane} className="mt-5 first:mt-3">
                    <h3 className="flex items-baseline gap-2 text-sm font-semibold">
                      {LANE_TITLE[lane]}
                      {inLane.length > 0 && <span className="font-normal text-muted tabular-nums">{inLane.length}</span>}
                    </h3>
                    {lane === "avvist" && split && (
                      <p className="mt-0.5 text-sm text-muted">
                        {split} Dommeren er Wybe Night Shift-simulatoren. Gjesten kan likevel få det: ett trykk.
                      </p>
                    )}
                    {limited.length > 0 && (
                      <ol className="mt-1 divide-y divide-line">
                        {limited.map((request) => (
                          <Row
                            key={request.id}
                            request={request}
                            now={now}
                            onAdvance={onAdvance}
                            onReopen={onReopen}
                            onAssign={onAssign}
                            onOpenCall={(task) => setCall({ task, open: true })}
                            undo={
                              last?.id === request.id
                                ? { key: last.key, message: last.message ?? `${last.what} står nå under ${titleOf(last.to)}.`, onUndo: undoLast, label: `Angre: ${last.what}` }
                                : undefined
                            }
                          />
                        ))}
                      </ol>
                    )}
                    {lane === "fullfort" && inLane.length > DONE_SHOWN && (
                      <Button variant="ghost" size="sm" className="-ml-3 mt-1" onClick={() => setAllDone((value) => !value)} aria-expanded={allDone}>
                        {allDone ? "Vis færre" : `Vis alle ${inLane.length}`}
                      </Button>
                    )}
                    {notice}
                  </div>
                );
              })
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
  now,
  onAdvance,
  onReopen,
  onAssign,
  onOpenCall,
  undo,
}: {
  request: RequestView;
  now: number;
  onAdvance: (request: RequestView) => void;
  onReopen: (request: RequestView) => void;
  onAssign: (request: RequestView, to: "robot" | "staff") => void;
  onOpenCall: (task: PhoneTask) => void;
  /** The line under the row the last action was on: what it did, and *Angre*. */
  undo?: { key: number; message: string; onUndo: () => void; label: string };
}) {
  const look = REQUEST_STATUS[request.status];
  const where = request.room ? placeLabel(request.room) : null;
  const named = `${request.kind}${where ? `, ${where}` : ""}`;
  const phone = request.phone;
  const call = phone ?? request.call;
  const verb = request.actionable ? verbOf(request) : null;
  const judged = request.status === "avvist" ? judgeLine(request) : null;
  return (
    <li className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
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
          {(request.reason || judged) && (
            <p className="text-sm text-text">
              {request.reason}
              {judged && <span className={cx(request.reason && "ml-1", request.decline?.judged === "credited" && "text-muted")}>{judged}</span>}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
            <span>{handlerLine(request, now)}</span>
            {call && (
              <button
                type="button"
                onClick={() => onOpenCall(call)}
                className="-my-2 inline-flex min-h-10 items-center font-semibold text-accent-text hover:underline pointer-coarse:min-h-11"
                aria-label={`Se samtalen: ${named}`}
              >
                Se samtalen
              </button>
            )}
          </p>
        </div>
        <div className={cx("flex shrink-0 flex-wrap items-center gap-3 sm:justify-end", phone && request.status === "venter" ? "sm:w-auto" : "sm:w-56")}>
          <Badge tone={look.tone}>{request.pending ? "I robotens kø" : (request.statusWord ?? look.word)}</Badge>
          {phone && request.status === "venter" ? (
            <AssignButtons request={request} task={phone} named={named} onAssign={onAssign} />
          ) : request.actionable && request.status === "fullfort" ? (
            <Button variant="ghost" size="sm" data-action-for={request.id} onClick={() => onReopen(request)} aria-label={`Angre fullført: ${named}`}>
              Angre
            </Button>
          ) : verb ? (
            <Button variant="secondary" size="sm" data-action-for={request.id} onClick={() => onAdvance(request)} aria-label={`${verb}: ${named}`}>
              {verb}
            </Button>
          ) : null}
        </div>
      </div>
      {undo && <UndoStatus key={undo.key} className="mt-2" message={undo.message} onUndo={undo.onUndo} undoLabel={undo.label} />}
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
