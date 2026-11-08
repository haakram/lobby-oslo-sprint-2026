import Link from "next/link";
import type { ComponentType } from "react";
import { LAST_COUNT, storeName } from "@/features/inventory/testData";
import type { WorkOrderView } from "@/features/maintenance/select";
import { type ModuleId, moduleById } from "@/features/modules/registry";
import { SourceNote } from "@/features/modules/SourceNote";
import { type RequestView, requestTotals, SOURCE_WORD } from "@/features/requests/select";
import { moneyHeadline } from "@/features/rooms/money";
import { SHIFTS } from "@/features/staff/testData";
import type { RunStatus } from "@/features/nightshift/useRun";
import { Badge, Card, cx, Monogram, RegenIcon, Skeleton } from "@/ui";
import { AVVIK, ROOM_STATUS } from "@/ui/roomStatus";
import { percent } from "./format";
import { placeLabel, type RoomStatus, STATUS_LOOK } from "./labels";
import type { DashboardData } from "./data";
import { ReceptionPanelView } from "./ReceptionPanel";
import { countRooms, floorsOfRooms } from "./selectors";
import { batteryLow, robotDoing } from "./TopBar";

/**
 * One widget per module on Oversikt: a dense summary and the way into the module. Registered by
 * module id; the dashboard renders the ones the role may open, in registry order.
 */

const SHOWN = 4;

/** Oversikt reads the good news first: ready rooms lead the legend, the rooms to clean follow. */
const LEGEND_ORDER: readonly RoomStatus[] = ["klar", "opptatt", "ma_vaskes", "ikke_forstyrr", "ukjent"];

/**
 * Minutes from noon, so a night and the morning after sort in the order they happened: 22:00 before
 * 05:40 before 07:12. For "latest first" lists that mix the robot's night with the day's work.
 */
function sinceNoon(clock: string | null): number {
  if (!clock) return -1;
  const [hours, minutes] = clock.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return -1;
  return (hours * 60 + minutes - 12 * 60 + 24 * 60) % (24 * 60);
}

/** The widget's good news, first under its name: a green check and the figure that went well. */
function GoodLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
      <RegenIcon name="circle-check" size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-success" />
      <span>{children}</span>
    </p>
  );
}

/** A figure inside a GoodLine. */
function Good({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-success tabular-nums">{children}</span>;
}

export type WidgetProps = { data: DashboardData; className?: string };

function Frame({
  module,
  children,
  className,
  count,
  countLabel,
}: {
  module: ModuleId;
  children: React.ReactNode;
  className?: string;
  count?: number;
  /** What the count counts, for a screen reader ("venter", "under minimum"). */
  countLabel?: string;
}) {
  const definition = moduleById(module);
  const id = `widget-${module}`;
  return (
    <section aria-labelledby={id} data-enter className={className}>
      <Card className="flex h-full flex-col sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id={id} className="flex items-baseline gap-2 text-lg font-semibold tracking-[-0.01em]">
            {definition.name}
            {count !== undefined && (
              <span className="text-base font-normal text-muted tabular-nums">
                {count}
                {countLabel && <span className="sr-only"> {countLabel}</span>}
              </span>
            )}
          </h2>
          <Link
            href={definition.route}
            aria-label={`Åpne ${definition.name}`}
            className="flex min-h-11 shrink-0 items-center text-sm font-semibold text-accent-text hover:underline"
          >
            Åpne
          </Link>
        </div>
        {children}
      </Card>
    </section>
  );
}

function Rows({ count = 3 }: { count?: number }) {
  return (
    <div className="mt-3 flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

/**
 * The night's part of a widget when there is no night to show: skeletons only while it loads; a
 * failed or empty night says so, instead of looking like it is still on its way.
 */
function NightMissing({ status }: { status: RunStatus }) {
  if (status === "loading") return <Rows count={3} />;
  return (
    <p className="mt-3 text-sm text-muted">
      {status === "error" ? "Ikke lastet: natteloggen svarte ikke. Trykk Prøv igjen lenger opp på siden." : "Ingen natt å vise ennå."}
    </p>
  );
}

/**
 * Rom og renhold: the room check's money first (jury round 2, the design juror: the hallway test starts here and
 * the money line was missing), then the key rack in small, every room a tile with its status icon.
 */
function RoomsWidget({ data, className }: WidgetProps) {
  const rooms = data.rooms;
  const counts = rooms ? countRooms(rooms) : null;
  const floorsDown = rooms ? [...floorsOfRooms(rooms)].reverse() : [];
  const money = data.money ? moneyHeadline(data.money) : null;
  const released = data.money ? data.money.toSell.length === 0 && data.money.released.length > 0 : false;
  return (
    <Frame module="rom" className={className}>
      {!rooms || !counts ? (
        <NightMissing status={data.nightStatus} />
      ) : (
        <>
          {money && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 rounded-md bg-sunken px-3 py-1">
              <p aria-live="polite" className="flex items-start gap-1.5 text-base font-semibold">
                <RegenIcon name={released ? "circle-check" : "key"} size={18} strokeWidth={2} className={cx("mt-0.5 shrink-0", released ? "text-success" : "text-muted")} />
                <span>{money}</span>
              </p>
              <Link href="/rom" className="flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">
                Se romsjekken
              </Link>
            </div>
          )}
          <ul aria-label="Rom per status" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {LEGEND_ORDER.map((status) => (
              <li key={status} className="flex items-center gap-1.5">
                {/* A status nobody is in stays grey: "Må vaskes 0" is not a warning. */}
                <RegenIcon name={ROOM_STATUS[status].icon} size={14} strokeWidth={2} className={cx("shrink-0", counts[status] > 0 ? STATUS_LOOK[status].word_class : "text-muted")} />
                <span className="text-muted">{STATUS_LOOK[status].word}</span>
                <span className="font-semibold tabular-nums">{counts[status]}</span>
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              {/* Quiet here: what an avvik needs is on Vedlikehold and in the bell, not in red on Oversikt. */}
              <RegenIcon name={AVVIK.icon} size={14} strokeWidth={2} className="shrink-0 text-muted" />
              <span className="text-muted">Avvik</span>
              <span className="font-semibold tabular-nums">{counts.avvik}</span>
            </li>
          </ul>
          <div className="mt-4 flex flex-col gap-2">
            {floorsDown.map((floor) => (
              <div key={floor} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-2">
                <span className="pt-1.5 font-mono text-sm font-medium text-muted tabular-nums">{floor}</span>
                {/* 40 px tiles with a mouse, so a 14-room floor fits one row at 1440 (no orphan 314); 44 px for a finger. */}
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-1 pointer-coarse:grid-cols-[repeat(auto-fill,minmax(44px,1fr))]">
                  {rooms
                    .filter((room) => room.floor === floor)
                    .map((room) => {
                      const look = STATUS_LOOK[room.status];
                      const avvik = room.openOrders > 0;
                      // Closed today: the bell's "Rom 137 er stengt i dag" and the tile say the same.
                      const word = room.closed ? "Ute av drift" : look.word;
                      return (
                        <li key={room.id}>
                          <Link
                            href={`/rom?rom=${room.id}`}
                            title={`Rom ${room.number}: ${word}${avvik ? ", avvik" : ""}`}
                            aria-label={`Rom ${room.number}: ${word}${avvik ? ", avvik" : ""}`}
                            className={cx(
                              "flex h-11 flex-col justify-between rounded-sm p-1 transition-[filter] duration-[120ms] ease-standard hover:brightness-110 focus-visible:outline-offset-[-2px]",
                              room.closed ? "bg-sunken" : look.tile,
                            )}
                          >
                            {/* The status as a shape too, not only a colour (WCAG 1.4.1): the legend above maps each icon. */}
                            <span aria-hidden="true" className="flex items-center gap-0.5">
                              <RegenIcon name={room.closed ? "key" : ROOM_STATUS[room.status].icon} size={12} strokeWidth={2} className={room.closed ? "text-muted" : look.word_class} />
                              {avvik && <RegenIcon name={AVVIK.icon} size={12} strokeWidth={2} className="text-muted" />}
                            </span>
                            <span className={cx("font-mono text-xs leading-none tabular-nums", look.loud && "font-semibold")}>{room.number}</span>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>
          <SourceNote className="mt-3" sources="run-log" />
        </>
      )}
    </Frame>
  );
}

function GuestsWidget({ data, className }: WidgetProps) {
  const { arrivals, departures } = data.guests;
  return (
    <Frame module="gjester" className={className}>
      <p className="mt-1 text-sm text-muted">
        <span className="font-semibold text-text tabular-nums">{arrivals.length}</span> ankomster ·{" "}
        <span className="font-semibold text-text tabular-nums">{departures.length}</span> avreiser i dag
      </p>
      <ol className="mt-2 divide-y divide-line">
        {arrivals.slice(0, SHOWN).map((stay) => (
          <li key={stay.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-semibold">{stay.name}</span>
              {stay.notes.length > 0 && (
                <Badge className="ml-2">{stay.notes[0]}</Badge>
              )}
            </span>
            <span className={stay.room ? "font-mono text-xs tabular-nums" : "text-xs font-semibold"}>{stay.room ? stay.room.replace(/^room-/, "") : "Uten rom"}</span>
          </li>
        ))}
      </ol>
      {arrivals.length > SHOWN && <p className="mt-1 text-sm text-muted">og {arrivals.length - SHOWN} til</p>}
      <SourceNote className="mt-3" sources="test" />
    </Frame>
  );
}

/** Requests: what got done first, the latest of it, and how many wait (those are in the bell). Counted as on Forespørsler. */
function RequestsWidget({ data, className }: WidgetProps) {
  const totals = requestTotals(data.requests);
  const done = data.requests.filter((request) => request.status === "fullfort");
  const latest = [...done].sort((a, b) => sinceNoon(b.at) - sinceNoon(a.at)).slice(0, SHOWN);
  return (
    <Frame module="foresporsler" className={className}>
      {data.loading && data.requests.length === 0 ? (
        <Rows />
      ) : data.requests.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Ingen forespørsler ennå i dag.</p>
      ) : (
        <>
          <GoodLine>
            <Good>{totals.done}</Good> av {totals.total} fullført
            {totals.waiting > 0 && ` · ${totals.waiting} venter på en person`}
          </GoodLine>
          {latest.length > 0 && (
            <ol aria-label="Sist fullført" className="mt-2 divide-y divide-line">
              {latest.map((request) => (
                <RequestDone key={request.id} request={request} />
              ))}
            </ol>
          )}
        </>
      )}
      <SourceNote className="mt-3" sources={["run-log", "reception", "test"]} />
    </Frame>
  );
}

function RequestDone({ request }: { request: RequestView }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2 text-sm">
      <span className="min-w-0 truncate">
        <span className="font-semibold">{request.kind}</span>
        {request.room && <span className="text-muted"> · {placeLabel(request.room)}</span>}
        <span className="text-muted"> · {SOURCE_WORD[request.source]}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-success">
        <RegenIcon name="check" size={14} strokeWidth={2} />
        {request.at ?? "Fullført"}
        <span className="sr-only"> fullført</span>
      </span>
    </li>
  );
}

/** Maintenance: what is fixed first, latest first; the open ones are counted and live on Vedlikehold. */
function MaintenanceWidget({ data, className }: WidgetProps) {
  const open = data.maintenance.filter((order) => order.status !== "lost");
  const fixed = data.maintenance.filter((order) => order.status === "lost").sort((a, b) => sinceNoon(b.at) - sinceNoon(a.at));
  const found = data.maintenance.filter((order) => order.origin === "robot").length;
  return (
    <Frame module="vedlikehold" className={className}>
      {data.loading && data.maintenance.length === 0 ? (
        <Rows />
      ) : data.maintenance.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Ingen arbeidsordre i dag.</p>
      ) : (
        <>
          <GoodLine>
            <Good>{fixed.length}</Good> løst i dag
            {found > 0 && (
              <>
                {" · roboten meldte "}
                <span className="font-semibold text-text tabular-nums">{found}</span> avvik i natt
              </>
            )}
          </GoodLine>
          {fixed.length > 0 && (
            <ol aria-label="Sist løst" className="mt-2 divide-y divide-line">
              {fixed.slice(0, SHOWN).map((order) => (
                <OrderFixed key={order.id} order={order} />
              ))}
            </ol>
          )}
          {open.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              <span className="font-semibold text-text tabular-nums">{open.length}</span> åpne, sortert etter prioritet på Vedlikehold.
            </p>
          )}
        </>
      )}
      <SourceNote className="mt-3" sources={["run-log", "test"]} />
    </Frame>
  );
}

function OrderFixed({ order }: { order: WorkOrderView }) {
  return (
    <li className="flex items-baseline gap-2 py-2 text-sm">
      <RegenIcon name="check" size={14} strokeWidth={2} className="shrink-0 self-center text-success" />
      <span className="sr-only">Løst: </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{placeLabel(order.room ?? order.place)}</span>
        <span className="text-muted"> · {order.text}</span>
      </span>
      {order.assignee && <span className="hidden shrink-0 text-xs text-muted sm:inline">{order.assignee}</span>}
    </li>
  );
}

/** Stores: how much is above minimum first; the item under it is listed plainly (its alert is in the bell). */
function InventoryWidget({ data, className }: WidgetProps) {
  const low = data.lowStock;
  const above = data.stock.length - low.length;
  return (
    <Frame module="lager" className={className}>
      <GoodLine>
        <Good>{above}</Good> av {data.stock.length} varer over minimum · talt {LAST_COUNT}
      </GoodLine>
      {low.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Alt er over minimum.</p>
      ) : (
        <>
          <p id="widget-lager-low" className="mt-3 text-xs text-muted">
            Under minimum
          </p>
          <ol aria-labelledby="widget-lager-low" className="divide-y divide-line">
            {low.slice(0, SHOWN).map((item) => (
              <li key={`${item.store}-${item.item}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{item.item}</span>
                  <span className="text-muted"> · {storeName(item.store)}</span>
                </span>
                <span className="font-mono text-xs whitespace-nowrap tabular-nums">
                  {item.count} / {item.expected}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      <SourceNote className="mt-3" sources="test" />
    </Frame>
  );
}

function StaffWidget({ data, className }: WidgetProps) {
  const shift = SHIFTS.find((entry) => entry.id === data.shift);
  return (
    <Frame module="ansatte" className={className} count={data.onShift.length} countLabel="på vakt">
      <p className="mt-1 text-sm text-muted">
        {shift?.label} {shift?.from}–{shift?.to}
      </p>
      <ul className="mt-2 divide-y divide-line">
        {data.onShift.slice(0, SHOWN + 2).map((member) => (
          <li key={member.id} className="flex items-center gap-2 py-2 text-sm">
            <Monogram name={member.name === "Roboten" ? "Ro" : member.name} size={24} className={member.name === "Roboten" ? "bg-accent text-on-accent" : undefined} />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{member.name}</span>
              <span className="text-muted"> · {member.role}</span>
            </span>
            {member.area && <span className="hidden truncate text-xs text-muted sm:inline">{member.area}</span>}
          </li>
        ))}
      </ul>
      <SourceNote className="mt-3" sources="test" />
    </Frame>
  );
}

/** Roboten: one small widget, not the 3D hotel (that is its own screen). */
function RobotWidget({ data, className }: WidgetProps) {
  const robot = data.robot;
  const low = batteryLow(robot);
  const tally = data.night?.tally ?? null;
  const state = !robot
    ? null
    : robot.ended
      ? { word: "Skift slutt", tone: "neutral" as const }
      : robot.current
        ? { word: "Jobber", tone: "accent" as const }
        : { word: "Venter på oppgave", tone: "success" as const };
  const definition = moduleById("hotell3d");
  return (
    <section aria-labelledby="widget-robot" data-enter className={className}>
      <Card className="flex h-full flex-col sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="widget-robot" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.01em]">
            <RegenIcon name="agent" size={20} className="text-accent-text" />
            Roboten
          </h2>
          {state && <Badge tone={state.tone}>{state.word}</Badge>}
        </div>
        {!robot ? (
          <NightMissing status={data.nightStatus} />
        ) : (
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Sted</dt>
            <dd className="font-semibold">{placeLabel(robot.location)}</dd>
            <dt className="text-muted">Gjør</dt>
            <dd>{robotDoing(robot)}</dd>
            <dt className="text-muted">Batteri</dt>
            {/* Plain here: a low battery is the robot manager's alert in the bell. */}
            <dd className="flex items-center gap-1 tabular-nums">
              <RegenIcon name={low ? "battery-low" : "battery"} size={16} className="text-muted" />
              {percent(robot.battery)}
            </dd>
            <dt className="text-muted">I natt</dt>
            <dd className="tabular-nums">
              <span className="font-semibold text-success">{tally?.done ?? 0}</span>
              {tally && tally.total > 0 && ` av ${tally.total}`} oppdrag fullført
            </dd>
            {tally && tally.reported > 0 && (
              <>
                <dt className="text-muted">Godkjent</dt>
                <dd className="tabular-nums">
                  {tally.done} av {tally.reported} av dommeren
                </dd>
              </>
            )}
          </dl>
        )}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          <Link href={definition.route} className="flex min-h-11 items-center text-accent-text hover:underline">
            Vis i 3D-kartet
          </Link>
          <Link href="/natteskift" className="flex min-h-11 items-center text-accent-text hover:underline">
            Natteskift
          </Link>
        </div>
      </Card>
    </section>
  );
}

function ReceptionWidget({ data, className }: WidgetProps) {
  // The screen's own calls, so Prøv igjen here also refreshes the Nå band's call-back row.
  return <ReceptionPanelView state={data.calls} retry={data.retryCalls} className={className} />;
}

export const WIDGETS: Partial<Record<ModuleId, ComponentType<WidgetProps>>> = {
  rom: RoomsWidget,
  gjester: GuestsWidget,
  foresporsler: RequestsWidget,
  vedlikehold: MaintenanceWidget,
  lager: InventoryWidget,
  ansatte: StaffWidget,
  hotell3d: RobotWidget,
  resepsjon: ReceptionWidget,
};

/** Widgets that take two columns on a wide screen. */
export const WIDE: ReadonlySet<ModuleId> = new Set(["rom"]);

