import { canAccess, type Role } from "@/features/auth/roles";
import {
  type HotelModule,
  MODULE_GROUPS,
  MODULES,
  type ModuleGroupId,
  type ModuleService,
  moduleById,
  PILOT_MODULES,
} from "@/features/modules/registry";
import type { RegenName } from "./icons/regenPaths";

export type NavItem = {
  href: string;
  label: string;
  /** The label under the icon in the phone bar. */
  short: string;
  /** One line that says what the screen is, shown in the menu sheet. */
  hint: string;
  icon: RegenName;
  pinned: boolean;
  /** A service the screen needs from the server (the voice agent); left out of the menu without it. */
  needs?: ModuleService;
};

/**
 * A group in the menu: one of the registry's, or one of the admin's pilot cut (`start`: Oversikt alone, no
 * label; `pilot`: the four pilot screens; `outside`: every other hotel screen, behind a disclosure).
 */
export type NavGroupId = ModuleGroupId | "start" | "pilot" | "outside";

export type NavGroup = {
  id: NavGroupId;
  /** Shown above the group; empty for the start page, which stands on its own. */
  label: string;
  items: readonly NavItem[];
  /** Starts folded behind a button with its label and count; opens by itself while one of its screens is on. */
  collapsible?: boolean;
};

export const PILOT_LABEL = "Piloten";
export const OUTSIDE_LABEL = "Utenfor piloten";
/** The line under *Utenfor piloten* once it is open: what these screens are, without selling them. */
export const OUTSIDE_HINT = "Bygget, men ikke med i piloten.";

/**
 * What the menu needs beyond the role. `services`: what this server has set up (undefined: unknown, so
 * everything shows). `pathname`: the page on screen, so an admin on a host screen can move between them.
 */
export type NavContext = { services?: readonly ModuleService[]; pathname?: string };

function toItem(module: HotelModule): NavItem {
  return {
    href: module.route,
    label: module.name,
    short: module.short ?? module.name,
    hint: module.hint,
    icon: module.icon,
    pinned: module.pinned ?? false,
    ...(module.needs ? { needs: module.needs } : {}),
  };
}

/** The screens, grouped by job, straight from the module registry. The order there is the order on screen. */
export const NAV_GROUPS: readonly NavGroup[] = MODULE_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  items: MODULES.filter((module) => module.group === group.id).map(toItem),
}));

/** The Airbnb host's own app (Utleie, under /vert). */
export const HOST_HOME = "/vert";

/** Is this one of the host's screens (Utleie, under /vert)? */
export function onHostScreen(pathname: string): boolean {
  return MODULES.some((module) => module.group === "utleie" && (pathname === module.route || pathname.startsWith(`${module.route}/`)));
}

/**
 * The groups a role sees, with the screens it may open; empty groups are dropped. The admin's rail is
 * the hotel's (jury round 1: 18 entries was too many for the demo): the host's group shows only while an
 * admin is on one of its screens, and the user plate links to it otherwise; and it is cut to the pilot
 * (`pilotCut`). A screen whose service the server lacks (Stemme without the voice agent) stays out of the
 * menu, for every role.
 */
export function groupsFor(role: Role, context: NavContext = {}): NavGroup[] {
  const { services, pathname } = context;
  const hostGroup = role === "host" || (pathname !== undefined && onHostScreen(pathname));
  const available = (item: NavItem) => !item.needs || services === undefined || services.includes(item.needs);
  const groups = NAV_GROUPS.filter((group) => group.id !== "utleie" || hostGroup)
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccess(role, item.href) && available(item)) }))
    .filter((group) => group.items.length > 0);
  return role === "admin" ? pilotCut(groups) : groups;
}

/**
 * The admin's menu, cut to the pilot (jury round 3, the product juror: 13 modules in the sidebar for a four-screen pilot):
 * Oversikt as the start page, *Piloten* (`PILOT_MODULES`, in that order), the host's group while on one of
 * its screens, then every other hotel screen under one collapsed *Utenfor piloten*: reachable, not in the way.
 * Only the menu changes; the admin may still open everything.
 */
function pilotCut(groups: readonly NavGroup[]): NavGroup[] {
  const hotel = groups.filter((group) => group.id !== "utleie").flatMap((group) => group.items);
  const start = hotel.filter((item) => item.href === "/");
  const pilot = PILOT_MODULES.flatMap((id) => hotel.filter((item) => item.href === moduleById(id).route));
  const outside = hotel.filter((item) => !start.includes(item) && !pilot.includes(item));
  const cut: NavGroup[] = [
    { id: "start", label: "", items: start },
    { id: "pilot", label: PILOT_LABEL, items: pilot },
    ...groups.filter((group) => group.id === "utleie"),
    { id: "outside", label: OUTSIDE_LABEL, items: outside, collapsible: true },
  ];
  return cut.filter((group) => group.items.length > 0);
}

/**
 * A role's own phone bar, when it differs from the registry's pins. The admin (the demo's morning manager,
 * `siri`) reaches the 06:00 handover in one tap from anywhere (jury round 3, the product juror): Oversikt, Overlevering,
 * Rom, Forespørsler, then Meny, where Natteskift leads and the rest sits under *Utenfor piloten*.
 */
const BAR_FOR: Partial<Record<Role, readonly string[]>> = {
  admin: ["/", "/overlevering", "/rom", "/foresporsler"],
};

/** The phone bar: the role's own bar or its pinned screens first, topped up in order, `count` in all. */
export function barItemsFor(role: Role, count: number, context: NavContext = {}): NavItem[] {
  const all = groupsFor(role, context).flatMap((group) => group.items);
  const own = BAR_FOR[role];
  const pinned = (own ? own.flatMap((href) => all.filter((item) => item.href === href)) : all.filter((item) => item.pinned)).slice(0, count);
  const rest = all.filter((item) => !pinned.includes(item));
  return [...pinned, ...rest].slice(0, count);
}

function under(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Is this screen the current one? A deeper screen owns its own path: /vert/meldinger is not also /vert. */
export function isActive(href: string, pathname: string): boolean {
  if (!under(href, pathname)) return false;
  return !MODULES.some((module) => module.route.length > href.length && module.route.startsWith(`${href}/`) && under(module.route, pathname));
}
