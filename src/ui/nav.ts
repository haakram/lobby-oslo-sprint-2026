import { canAccess, type Role } from "@/features/auth/roles";
import { type HotelModule, MODULE_GROUPS, MODULES } from "@/features/modules/registry";
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
};

export type NavGroup = { label: string; items: readonly NavItem[] };

function toItem(module: HotelModule): NavItem {
  return { href: module.route, label: module.name, short: module.short ?? module.name, hint: module.hint, icon: module.icon, pinned: module.pinned ?? false };
}

/** The screens, grouped by job, straight from the module registry. The order there is the order on screen. */
export const NAV_GROUPS: readonly NavGroup[] = MODULE_GROUPS.map((group) => ({
  label: group.label,
  items: MODULES.filter((module) => module.group === group.id).map(toItem),
}));

/** The groups a role sees, with the screens it may open; empty groups are dropped. */
export function groupsFor(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => canAccess(role, item.href)) })).filter(
    (group) => group.items.length > 0,
  );
}

/** The phone bar: the role's pinned screens first, topped up in order, `count` in all. */
export function barItemsFor(role: Role, count: number): NavItem[] {
  const all = groupsFor(role).flatMap((group) => group.items);
  const pinned = all.filter((item) => item.pinned).slice(0, count);
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
