import Link from "next/link";
import type { ComponentType } from "react";
import { isLow, storeName } from "@/features/inventory/testData";
import { PRIORITY } from "@/features/maintenance/select";
import { type ModuleId, moduleById } from "@/features/modules/registry";
import { SourceNote } from "@/features/modules/SourceNote";
import { REQUEST_STATUS, SOURCE_WORD, waiting } from "@/features/requests/select";
import { SHIFTS } from "@/features/staff/testData";
import { Badge, Card, cx, Monogram, RegenIcon, Skeleton } from "@/ui";
import { percent } from "./format";
import { placeLabel, STATUS_LOOK, STATUS_ORDER } from "./labels";
import type { DashboardData } from "./now";
import { ReceptionPanel } from "./ReceptionPanel";
import { countRooms, floorsOfRooms } from "./selectors";
import { batteryLow, robotDoing } from "./TopBar";

/**
 * One widget per module on Oversikt: a dense summary and the way into the module. Registered by
 * module id; the dashboard renders the ones the role may open, in registry order.
 */

const SHOWN = 4;

export type WidgetProps = { data: DashboardData; className?: string };

function Frame({ module, children, className, count }: { module: ModuleId; children: React.ReactNode; className?: string; count?: number }) {
  const definition = moduleById(module);
  const id = `widget-${module}`;
  return (
    <section aria-labelledby={id} data-enter className={className}>
      <Card className="flex h-full flex-col sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id={id} className="flex items-baseline gap-2 text-lg font-semibold tracking-[-0.01em]">
            {definition.name}
            {count !== undefined && <span className="text-base font-normal text-muted tabular-nums">{count}</span>}
          </h2>
          <Link href={definition.route} className="flex min-h-11 shrink-0 items-center text-sm font-semibold text-accent-text hover:underline">
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

/** Rom og renhold: the key rack in small, every room a tile in its status colour. */
function RoomsWidget({ data, className }: WidgetProps) {
  const rooms = data.rooms;
  const counts = rooms ? countRooms(rooms) : null;
  const floorsDown = rooms ? [...floorsOfRooms(rooms)].reverse() : [];
  return (
    <Frame module="rom" className={className}>
      {!rooms || !counts ? (
        <Rows count={3} />
      ) : (
        <>
          <ul aria-label="Rom per status" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {STATUS_ORDER.map((status) => (
              <li key={status} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={cx("h-1.5 w-4 rounded-full", STATUS_LOOK[status].tag)} />
                <span className="text-muted">{STATUS_LOOK[status].word}</span>
                <span className="font-semibold tabular-nums">{counts[status]}</span>
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-full bg-danger" />
              <span className="text-muted">Avvik</span>
              <span className="font-semibold tabular-nums">{counts.avvik}</span>
            </li>
          </ul>
          <div className="mt-4 flex flex-col gap-2">
            {floorsDown.map((floor) => (
              <div key={floor} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-2">
                <span className="pt-1.5 font-mono text-sm font-medium text-muted tabular-nums">{floor}</span>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1">
                  {rooms
                    .filter((room) => room.floor === floor)
                    .map((room) => {
                      const look = STATUS_LOOK[room.status];
                      const avvik = room.openOrders > 0;
                      return (
                        <li key={room.id}>
                          <Link
                            href={`/rom?rom=${room.id}`}
                            title={`Rom ${room.number}: ${look.word}${avvik ? ", avvik" : ""}`}
                            aria-label={`Rom ${room.number}: ${look.word}${avvik ? ", avvik" : ""}`}
                            className={cx(
                              "flex h-9 flex-col justify-between rounded-sm p-1 transition-[filter] duration-[120ms] ease-standard hover:brightness-110 focus-visible:outline-offset-[-2px]",
                              look.tile,
                              avvik && "shadow-[inset_2px_0_0_0_var(--danger)]",
                            )}
                          >
                            <span aria-hidden="true" className={cx("h-1 w-3 rounded-full", look.tag)} />
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
                <Badge tone="warning" className="ml-2">
                  {stay.notes[0]}
                </Badge>
              )}
            </span>
            <span className={stay.room ? "font-mono text-xs tabular-nums" : "text-xs font-semibold text-warning"}>{stay.room ? stay.room.replace(/^room-/, "") : "Uten rom"}</span>
          </li>
        ))}
      </ol>
      {arrivals.length > SHOWN && <p className="mt-1 text-sm text-muted">og {arrivals.length - SHOWN} til</p>}
      <SourceNote className="mt-3" sources="test" />
    </Frame>
  );
}

function RequestsWidget({ data, className }: WidgetProps) {
  const waits = waiting(data.requests);
  return (
    <Frame module="foresporsler" className={className} count={waits.length}>
      {data.loading && data.requests.length === 0 ? (
        <Rows />
      ) : waits.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Ingen forespørsler venter på noen.</p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {waits.slice(0, SHOWN).map((request) => (
            <li key={request.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{request.kind}</span>
                {request.room && <span className="text-muted"> · {placeLabel(request.room)}</span>}
                <span className="text-muted"> · {SOURCE_WORD[request.source]}</span>
              </span>
              <Badge tone={REQUEST_STATUS[request.status].tone}>{REQUEST_STATUS[request.status].word}</Badge>
            </li>
          ))}
        </ol>
      )}
      {waits.length > SHOWN && <p className="mt-1 text-sm text-muted">og {waits.length - SHOWN} til</p>}
      <SourceNote className="mt-3" sources={["run-log", "reception", "test"]} />
    </Frame>
  );
}

function MaintenanceWidget({ data, className }: WidgetProps) {
  const open = data.maintenance.filter((order) => order.status !== "lost");
  return (
    <Frame module="vedlikehold" className={className} count={open.length}>
      {data.loading && open.length === 0 ? (
        <Rows />
      ) : open.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Ingen åpne arbeidsordre.</p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {open.slice(0, SHOWN).map((order) => (
            <li key={order.id} className="flex items-baseline gap-2 py-2 text-sm">
              <Badge tone={PRIORITY[order.priority].tone}>{PRIORITY[order.priority].word}</Badge>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{order.room ? placeLabel(order.room) : placeLabel(order.place)}</span>
                <span className="text-muted"> · {order.text}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {open.length > SHOWN && <p className="mt-1 text-sm text-muted">og {open.length - SHOWN} til</p>}
      <SourceNote className="mt-3" sources={["run-log", "test"]} />
    </Frame>
  );
}

function InventoryWidget({ data, className }: WidgetProps) {
  const low = data.lowStock;
  return (
    <Frame module="lager" className={className} count={low.length}>
      {low.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Alt er over minimum.</p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {low.slice(0, SHOWN).map((item) => (
            <li key={`${item.store}-${item.item}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{item.item}</span>
                <span className="text-muted"> · {storeName(item.store)}</span>
              </span>
              <span className={cx("font-mono text-xs tabular-nums", isLow(item) && "font-semibold text-danger")}>
                {item.count} / {item.expected}
              </span>
            </li>
          ))}
        </ol>
      )}
      <SourceNote className="mt-3" sources="test" />
    </Frame>
  );
}

function StaffWidget({ data, className }: WidgetProps) {
  const shift = SHIFTS.find((entry) => entry.id === data.shift);
  return (
    <Frame module="ansatte" className={className} count={data.onShift.length}>
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
          <Rows />
        ) : (
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Sted</dt>
            <dd className="font-semibold">{placeLabel(robot.location)}</dd>
            <dt className="text-muted">Gjør</dt>
            <dd>{robotDoing(robot)}</dd>
            <dt className="text-muted">Batteri</dt>
            <dd className={cx("flex items-center gap-1 tabular-nums", low && "font-semibold text-warning")}>
              {low && <RegenIcon name="battery-low" size={16} />}
              {percent(robot.battery)}
              {low && " · lavt"}
            </dd>
            <dt className="text-muted">I natt</dt>
            <dd className="tabular-nums">
              {data.night?.tasksDone ?? 0} oppgaver fullført
              {data.night && data.night.tasksFailed > 0 && <span className="font-semibold text-danger"> · {data.night.tasksFailed} feilet</span>}
            </dd>
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

function ReceptionWidget({ className }: WidgetProps) {
  return <ReceptionPanel className={className} />;
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

