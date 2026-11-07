import { canAccess, type Role } from "@/features/auth/roles";
import type { RegenName } from "./icons/regenPaths";

export type NavItem = {
  href: string;
  label: string;
  /** One line that says what the screen is, shown in the menu sheet. */
  hint: string;
  icon: RegenName;
};

export type NavGroup = { label: string; items: readonly NavItem[] };

/** The screens, grouped by job (DESIGN.md "World"). The order inside a group is the order on screen. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Hotellet",
    items: [
      { href: "/", label: "Oversikt", hint: "Hele hotellet nå", icon: "layout-grid" },
      { href: "/hotell", label: "3D-kart", hint: "Gå rundt i hotellet", icon: "cube" },
      { href: "/ruter", label: "Ruter", hint: "Korteste vei mellom etasjene", icon: "route" },
    ],
  },
  {
    label: "Roboten",
    items: [
      { href: "/natteskift", label: "Natteskift", hint: "Robotens natt, steg for steg", icon: "moon" },
      { href: "/oyne", label: "Øyne", hint: "Robotens øyne", icon: "eye" },
      { href: "/stemme", label: "Stemme", hint: "Snakk gjennom roboten", icon: "mic" },
    ],
  },
  {
    label: "Resepsjon",
    items: [{ href: "/resepsjon", label: "Resepsjon", hint: "Telefonen, bookinger og beskjeder", icon: "phone" }],
  },
];

/** The groups a role sees, with the screens it may open; empty groups are dropped. */
export function groupsFor(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => canAccess(role, item.href)) })).filter(
    (group) => group.items.length > 0,
  );
}

export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
