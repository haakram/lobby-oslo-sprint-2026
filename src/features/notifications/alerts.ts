import { canAccess } from "@/features/auth/roles";
import type { DashboardData } from "@/features/dashboard/data";
import { hhmm, percent } from "@/features/dashboard/format";
import { placeLabel } from "@/features/dashboard/labels";
import { batteryLow } from "@/features/dashboard/TopBar";
import { corridorName, openWetFloors, SAFETY_DUE, STRANGER_OWNER, WET_FLOOR_OWNER } from "@/features/handover/safety";
import { storeName } from "@/features/inventory/testData";
import { type ModuleId, moduleById } from "@/features/modules/registry";
import type { RegenName } from "@/ui/icons/regenPaths";

/**
 * What the bell holds: only what needs a person, each with its one way in (team lead 2026-11-08:
 * "put this into a bell where they have to check it"). Routine work is not here: the cleaning route
 * is Oversikt's primary action, and the night's totals are its figures.
 */

/** Haster: a guest is waiting or something must be done first. Obs: needs doing today. */
export type AlertPriority = "hoy" | "obs";

export type Alert = {
  /** Stable per kind of alert, so a seen alert stays seen while it shrinks. */
  id: string;
  /** How much of it there is (a count). Above the level that was seen, the alert is new again. */
  level: number;
  /** The screen the action opens; a role sees only alerts for screens it may open. */
  module: ModuleId;
  priority: AlertPriority;
  icon: RegenName;
  title: string;
  detail: string | null;
  action: { label: string; href: string };
};

/** The bell lists this many; anything after it is named in one line, never dropped silently. */
export const MAX_ALERTS = 5;

export type AlertData = Pick<DashboardData, "role" | "requests" | "maintenance" | "outOfOrder" | "guests" | "calls" | "lowStock" | "robot"> &
  Partial<Pick<DashboardData, "safety">>;

function open(module: ModuleId) {
  const definition = moduleById(module);
  return { label: `Åpne ${definition.short ?? definition.name}`, href: definition.route };
}

/** "101, 106 og 204", "101, 106, 204 og 3 til". */
function list(words: readonly string[], shown = 3): string {
  if (words.length <= 1) return words.join("");
  if (words.length <= shown) return `${words.slice(0, -1).join(", ")} og ${words.at(-1)}`;
  return `${words.slice(0, shown).join(", ")} og ${words.length - shown} til`;
}

function roomNumber(room: string): string {
  return room.replace(/^room-/, "");
}

/** Every alert the role may act on, Haster first. The bell shows the first MAX_ALERTS. */
export function selectAlerts(data: AlertData): Alert[] {
  const alerts: Alert[] = [];
  const may = (route: string) => canAccess(data.role, route);

  // Safety first (jury round 3): each wet floor nobody has signed is its own Haster, with an owner and
  // a time, then the stranger the robot refused all night. Overlevering's Åpent nå opens with the same.
  const wet = data.maintenance.filter((order) => order.safety && order.status !== "lost");
  const wetScreen: ModuleId = may("/vedlikehold") ? "vedlikehold" : "hotell3d";
  const wetAction = wetScreen === "vedlikehold" ? open("vedlikehold") : { label: "Vis i 3D-kartet", href: "/hotell" };
  const lost = new Set(data.maintenance.filter((order) => order.status === "lost").map((order) => order.id));
  const floors = data.safety ? openWetFloors(data.safety.wetFloors, (id) => lost.has(id)) : null;
  if (floors) {
    for (const floor of floors) {
      const why = floor.signMoved
        ? ` Skiltet ble flyttet til ${floor.signMoved.to ? corridorName(floor.signMoved.to) : "et nytt søl"}.`
        : floor.slippedAt
          ? " Roboten skled der."
          : "";
      alerts.push({
        id: `wet-floor:${floor.place}`,
        level: 1,
        module: wetScreen,
        priority: "hoy",
        icon: "alert-triangle",
        title: `Vått gulv uten skilt i ${corridorName(floor.place)}`,
        detail: `${floor.since ? `Siden ${hhmm(floor.since)}.` : "I natt."}${why} ${WET_FLOOR_OWNER}, innen ${SAFETY_DUE}.`,
        action: wetAction,
      });
    }
  } else if (wet.length > 0) {
    // Without the run log's safety reading (a test, an old caller): one alert from Vedlikehold's orders.
    const places = wet.map((order) => {
      const label = placeLabel(order.place ?? order.room);
      return label.charAt(0).toLowerCase() + label.slice(1);
    });
    alerts.push({
      id: "wet-floor",
      level: wet.length,
      module: wetScreen,
      priority: "hoy",
      icon: "alert-triangle",
      title: wet.length === 1 ? `Vått gulv uten skilt i ${places[0]}` : `${wet.length} våte gulv uten skilt`,
      detail: `${wet.length === 1 ? `Siden ${wet[0].at ?? "i natt"}` : `I ${list(places)}`}. Sett ut et varselskilt eller tørk opp før gjestene står opp.`,
      action: wetAction,
    });
  }

  // The robot refused a stranger at door after door and told no one (jury round 2, the Wybe engineer): a person must know.
  const stranger = data.safety?.stranger;
  if (stranger) {
    const rooms = stranger.rooms.length || stranger.refusals.length;
    const screen: ModuleId = may("/overlevering") ? "overlevering" : "natteskift";
    alerts.push({
      id: "stranger",
      level: stranger.refusals.length,
      module: screen,
      priority: "hoy",
      icon: "shield",
      title: `En ukjent person ba om å komme inn på ${rooms === 1 ? "ett rom" : `${rooms} rom`}`,
      detail: `${stranger.refusals.length > 1 ? `${hhmm(stranger.first)}–${hhmm(stranger.last)}. Roboten sa nei hver gang.` : `Kl. ${hhmm(stranger.first)}. Roboten sa nei.`} ${STRANGER_OWNER}: se på kamera og skriv en avviksmelding.`,
      action: open(screen),
    });
  }

  // The robot gave these back: it failed them, or the night ended before it got there. Not what it
  // refused on good grounds (no order on record) or what the night manager called off: those are done with.
  const handed = data.requests.filter((request) => request.source === "robot" && (request.status === "feilet" || request.status === "venter"));
  if (handed.length > 0) {
    const rooms = [...new Set(handed.flatMap((request) => (request.room ? [roomNumber(request.room)] : [])))];
    alerts.push({
      id: "handover",
      level: handed.length,
      module: "foresporsler",
      priority: "hoy",
      icon: "inbox",
      title: `Roboten ga ${handed.length} ${handed.length === 1 ? "forespørsel" : "forespørsler"} videre`,
      detail: rooms.length > 0 ? `Gjester i rom ${list(rooms)} venter på en person.` : "De venter på en person.",
      action: open("foresporsler"),
    });
  }

  // Staff-reported orders marked high; the robot's high ones are the handover above.
  const urgent = data.maintenance.filter((order) => order.origin === "personale" && order.status !== "lost" && order.priority === "hoy" && !order.outOfOrder);
  if (urgent.length > 0) {
    alerts.push({
      id: "urgent",
      level: urgent.length,
      module: "vedlikehold",
      priority: "hoy",
      icon: "tool",
      title: urgent.length === 1 ? `Haster: ${placeLabel(urgent[0].room ?? urgent[0].place).toLowerCase()}` : `${urgent.length} arbeidsordre haster`,
      detail: urgent.length === 1 ? urgent[0].text : list(urgent.map((order) => placeLabel(order.room ?? order.place))),
      action: open("vedlikehold"),
    });
  }

  if (data.calls.kind === "ready") {
    const callers = data.calls.calls.filter((call) => call.needsCallback);
    if (callers.length > 0) {
      const names = callers.flatMap((call) => (call.callerName ? [call.callerName] : []));
      alerts.push({
        id: "callbacks",
        level: callers.length,
        module: "resepsjon",
        priority: "obs",
        icon: "phone",
        title: `${callers.length} ${callers.length === 1 ? "innringer venter" : "innringere venter"} på svar`,
        detail: names.length > 0 ? `Ring tilbake til ${list(names, 2)}.` : "AI-resepsjonisten lovet at noen ringer tilbake.",
        action: open("resepsjon"),
      });
    }
  }

  const noRoom = data.guests.arrivals.filter((stay) => !stay.room);
  if (noRoom.length > 0) {
    alerts.push({
      id: "no-room",
      level: noRoom.length,
      module: "gjester",
      priority: "obs",
      icon: "users",
      title: noRoom.length === 1 ? `${noRoom[0].name} kommer i dag og har ikke rom ennå` : `${noRoom.length} ankomster i dag har ikke rom ennå`,
      detail: noRoom.length === 1 ? "Gjester viser hvilke rom som er klare." : list(noRoom.map((stay) => stay.name), 2),
      action: open("gjester"),
    });
  }

  if (data.outOfOrder.length > 0) {
    const first = data.maintenance.find((order) => order.room === data.outOfOrder[0] && order.outOfOrder && order.status !== "lost");
    const rooms = data.outOfOrder.map(roomNumber);
    // The receptionist can't open Vedlikehold; Rom og renhold lists the closed rooms too.
    const screen: ModuleId = may("/vedlikehold") ? "vedlikehold" : "rom";
    alerts.push({
      id: "out-of-order",
      level: rooms.length,
      module: screen,
      priority: "obs",
      icon: "key",
      title: rooms.length === 1 ? `Rom ${rooms[0]} er stengt i dag` : `Rom ${list(rooms)} er stengt i dag`,
      detail: first ? `${first.text}${first.assignee ? ` Hos ${first.assignee}.` : ""}` : "Rommene selges ikke før de er klare.",
      action: open(screen),
    });
  }

  if (data.lowStock.length > 0) {
    const [item] = data.lowStock;
    alerts.push({
      id: "stock",
      level: data.lowStock.length,
      module: "lager",
      priority: "obs",
      icon: "archive",
      title: data.lowStock.length === 1 ? `${item.item} er under minimum` : `${data.lowStock.length} varer er under minimum`,
      detail:
        data.lowStock.length === 1
          ? `${item.count} av ${item.expected} igjen i ${storeName(item.store).toLowerCase()}.`
          : list(data.lowStock.map((stock) => stock.item.toLowerCase())),
      action: open("lager"),
    });
  }

  if (data.robot && batteryLow(data.robot)) {
    alerts.push({
      id: "battery",
      level: 1,
      module: "hotell3d",
      priority: "obs",
      icon: "battery-low",
      // The robot docks itself; what the morning needs to know is that it did not get there in time.
      title: data.robot.ended ? "Roboten rakk ikke å lade før 06:00" : "Roboten må lade snart",
      detail: `Batteriet står på ${percent(data.robot.battery)}${data.robot.ended ? " etter natten" : ""}.`,
      action: { label: "Vis i 3D-kartet", href: "/hotell" },
    });
  }

  const rank = (alert: Alert) => (alert.priority === "hoy" ? 0 : 1);
  return alerts.filter((alert) => may(moduleById(alert.module).route)).sort((a, b) => rank(a) - rank(b));
}
