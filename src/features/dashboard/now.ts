import { canAccess, type Role } from "@/features/auth/roles";
import type { GuestDay } from "@/features/guests/testData";
import type { StockItem } from "@/features/inventory/testData";
import type { WorkOrderView } from "@/features/maintenance/select";
import { type ModuleId, moduleById } from "@/features/modules/registry";
import { type RequestView, waiting } from "@/features/requests/select";
import type { ShiftId, StaffMember } from "@/features/staff/testData";
import type { RegenName } from "@/ui/icons/regenPaths";
import { percent } from "./format";
import { cleaningHref, type Night, type RobotView, type RoomView } from "./selectors";
import { batteryLow } from "./TopBar";
import type { CallsState } from "./useReceptionCalls";

/** Everything Oversikt knows, shaped once and handed to the Nå band, the figures and every widget. */
export type DashboardData = {
  role: Role;
  loading: boolean;
  night: Night | null;
  rooms: RoomView[] | null;
  robot: RobotView | null;
  requests: RequestView[];
  maintenance: WorkOrderView[];
  outOfOrder: string[];
  guests: GuestDay;
  calls: CallsState;
  lowStock: StockItem[];
  shift: ShiftId;
  onShift: StaffMember[];
};

export type NowTone = "danger" | "warning" | "muted";

export type NowItem = {
  id: string;
  module: ModuleId;
  tone: NowTone;
  icon: RegenName;
  text: string;
  action: { label: string; href: string; primary?: boolean } | null;
};

const RANK: Record<NowTone, number> = { danger: 0, warning: 1, muted: 2 };
const MAX_ROWS = 6;

function numbers(rooms: readonly { number: string }[]): string {
  return rooms.map((room) => room.number).join(", ");
}

function open(module: ModuleId) {
  const definition = moduleById(module);
  return { label: `Åpne ${definition.short ?? definition.name}`, href: definition.route };
}

/**
 * What needs a person now, across every module the role may open, loudest first. The primary action
 * of the whole screen (the cleaning route) is the first row when rooms need cleaning.
 */
export function selectNow(data: DashboardData): NowItem[] {
  const items: NowItem[] = [];
  const rooms = data.rooms ?? [];
  const dirty = rooms.filter((room) => room.status === "ma_vaskes");
  const unchecked = rooms.filter((room) => room.status === "ukjent");

  if (data.rooms) {
    items.push({
      id: "dirty",
      module: "rom",
      tone: dirty.length > 0 ? "warning" : "muted",
      icon: "flag",
      text:
        dirty.length > 0
          ? `${dirty.length} rom må vaskes: ${numbers(dirty)}`
          : unchecked.length > 0
            ? `Ingen rom må vaskes · ${unchecked.length} rom er ikke sjekket`
            : "Ingen rom må vaskes",
      action:
        dirty.length > 0
          ? { label: "Lag renholdsrute", href: cleaningHref(dirty.map((room) => room.id)), primary: true }
          : unchecked.length > 0
            ? { label: "Lag sjekkrunde", href: cleaningHref(unchecked.map((room) => room.id)) }
            : null,
    });
  }

  const waits = waiting(data.requests);
  if (waits.length > 0) {
    items.push({
      id: "requests",
      module: "foresporsler",
      tone: waits.some((request) => request.status === "feilet") ? "danger" : "warning",
      icon: "inbox",
      text: `${waits.length} ${waits.length === 1 ? "forespørsel venter" : "forespørsler venter"} på noen`,
      action: open("foresporsler"),
    });
  }

  const high = data.maintenance.filter((order) => order.status !== "lost" && order.priority === "hoy");
  if (high.length > 0) {
    items.push({
      id: "high",
      module: "vedlikehold",
      tone: "danger",
      icon: "tool",
      text: `${high.length} ${high.length === 1 ? "arbeidsordre" : "arbeidsordre"} med høy prioritet`,
      action: open("vedlikehold"),
    });
  }

  if (data.outOfOrder.length > 0) {
    items.push({
      id: "ooo",
      module: "vedlikehold",
      tone: "warning",
      icon: "key",
      text: `${data.outOfOrder.length} rom ute av drift: ${data.outOfOrder.map((room) => room.replace(/^room-/, "")).join(", ")}`,
      action: open("vedlikehold"),
    });
  }

  const noRoom = data.guests.arrivals.filter((stay) => !stay.room);
  if (noRoom.length > 0) {
    items.push({
      id: "no-room",
      module: "gjester",
      tone: "warning",
      icon: "users",
      text: `${noRoom.length} ${noRoom.length === 1 ? "ankomst" : "ankomster"} i dag uten rom: ${noRoom.map((stay) => stay.name).join(", ")}`,
      action: open("gjester"),
    });
  }

  if (data.calls.kind === "ready") {
    const callbacks = data.calls.calls.filter((call) => call.needsCallback);
    if (callbacks.length > 0) {
      items.push({
        id: "callbacks",
        module: "resepsjon",
        tone: "warning",
        icon: "phone",
        text: `${callbacks.length} ${callbacks.length === 1 ? "innringer" : "innringere"} å ringe tilbake`,
        action: open("resepsjon"),
      });
    }
  }

  if (data.lowStock.length > 0) {
    items.push({
      id: "stock",
      module: "lager",
      tone: "warning",
      icon: "archive",
      text: `${data.lowStock.length} varer under minimum: ${data.lowStock.map((item) => item.item.toLowerCase()).slice(0, 3).join(", ")}${data.lowStock.length > 3 ? " …" : ""}`,
      action: open("lager"),
    });
  }

  if (data.robot) {
    const low = batteryLow(data.robot);
    items.push({
      id: "robot",
      module: "hotell3d",
      tone: low ? "warning" : "muted",
      icon: low ? "battery-low" : "agent",
      text: low
        ? `Roboten har lavt batteri, ${percent(data.robot.battery)}${data.robot.ended ? " · skiftet er over" : ""}`
        : data.robot.ended
          ? `Roboten er ferdig for natten · batteri ${percent(data.robot.battery)}`
          : `Roboten jobber · batteri ${percent(data.robot.battery)}`,
      action: { label: "Vis i 3D-kartet", href: "/hotell" },
    });
  }

  return items
    .filter((item) => canAccess(data.role, moduleById(item.module).route))
    .sort((a, b) => RANK[a.tone] - RANK[b.tone])
    .slice(0, MAX_ROWS);
}
