"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { homeFor, type Role } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { cx } from "./cx";
import { RegenIcon } from "./icons/RegenIcon";
import { barItemsFor, groupsFor, isActive, type NavGroup, type NavItem } from "./nav";
import { Sheet } from "./Sheet";
import { UserPlate } from "./UserPlate";

export const HOTEL_NAME = "Hotell Nattskift";

/** The line under "Lobby": the hotel, or for the host (an Airbnb host) their own apartments. */
function placeFor(role: Role): string {
  return role === "host" ? "Korttidsutleie i Oslo" : HOTEL_NAME;
}

/** How many of the role's screens fit on the phone bar before the rest go into Meny. */
const BAR_ITEMS = 4;

const DESKTOP = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Desktop until the browser says otherwise (the server and jsdom have no media queries). */
function readDesktop() {
  return typeof window.matchMedia !== "function" ? true : window.matchMedia(DESKTOP).matches;
}

/**
 * The navigation, grouped by job (Hotellet · Drift · Roboten · Resepsjon, from the module registry)
 * and filtered by what the effective role may open. Desktop: a rail on the Natt surface with the user plate bottom-left.
 * Phone: a slim top bar (the name and the bell) and a bottom bar with the first screens and Meny,
 * which opens the whole list as a sheet. `bell` (the notifications, from the layout) sits at the top
 * of the rail on desktop and in the top bar on a phone: on every page, for every role.
 * Hidden on the login page.
 */
export function AppNav({ bell }: { bell?: ReactNode }) {
  const pathname = usePathname();
  const { effectiveRole } = useSession();
  const desktop = useSyncExternalStore(subscribe, readDesktop, () => true);

  // Nobody logged in (the login page, the no-access page): no navigation.
  if (!effectiveRole || pathname.startsWith("/login")) return null;
  const groups = groupsFor(effectiveRole);
  // The host's pages carry their own bell (the apartments' items), so the hotel's bell is not shown to a host.
  const hotelBell = effectiveRole === "host" ? undefined : bell;
  return desktop ? (
    <Rail groups={groups} pathname={pathname} bell={hotelBell} home={homeFor(effectiveRole)} place={placeFor(effectiveRole)} />
  ) : (
    <Bar groups={groups} shown={barItemsFor(effectiveRole, BAR_ITEMS)} pathname={pathname} bell={hotelBell} place={placeFor(effectiveRole)} />
  );
}

function Rail({ groups, pathname, bell, home, place }: { groups: NavGroup[]; pathname: string; bell?: ReactNode; home: string; place: string }) {
  return (
    <nav
      aria-label="Hovedmeny"
      data-surface="dark"
      className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col bg-surface text-text lg:flex"
    >
      <div className="flex items-start justify-between gap-1 pr-3">
        <Link href={home} className="flex min-w-0 flex-col px-6 pt-7 pb-6 focus-visible:outline-offset-[-4px]">
          <span className="text-xl font-bold leading-none tracking-[-0.02em]">Lobby</span>
          <span className="mt-1.5 text-xs text-muted">{place}</span>
        </Link>
        {bell && <div className="pt-5">{bell}</div>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1 text-xs font-medium text-muted">{group.label}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <RailLink item={item} active={isActive(item.href, pathname)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-2">
        <UserPlate />
      </div>
    </nav>
  );
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        // 40 px with a mouse; 44 px on touch (the rail also shows on an iPad in landscape).
        "relative flex min-h-10 items-center gap-3 rounded-sm px-3 text-sm font-medium pointer-coarse:min-h-11",
        "transition-colors duration-[120ms] ease-standard focus-visible:outline-offset-[-2px]",
        active ? "bg-sunken text-text" : "text-muted hover:bg-sunken hover:text-text",
      )}
    >
      {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-r-sm bg-accent animate-fade" />}
      <RegenIcon name={item.icon} size={20} className={cx("shrink-0", active ? "text-accent-text" : "text-muted")} />
      {item.label}
    </Link>
  );
}

function Bar({ groups, shown, pathname, bell, place }: { groups: NavGroup[]; shown: NavItem[]; pathname: string; bell?: ReactNode; place: string }) {
  const [menu, setMenu] = useState(false);
  const rest = groups.flatMap((group) => group.items).filter((item) => !shown.includes(item));
  const restActive = rest.some((item) => isActive(item.href, pathname));

  return (
    <>
      {/* The phone's top edge: the name, and the bell where people look for it. */}
      <header data-surface="dark" className="bg-bg pt-[env(safe-area-inset-top)] text-text lg:hidden">
        <div className="flex min-h-14 items-center justify-between gap-3 pr-2 pl-4">
          <Link href="/" className="flex min-h-11 min-w-0 items-baseline gap-2 focus-visible:outline-offset-[-2px]">
            <span className="text-lg font-bold tracking-[-0.02em]">Lobby</span>
            <span className="truncate text-xs text-muted">{place}</span>
          </Link>
          {bell}
        </div>
      </header>
      <nav
        aria-label="Hovedmeny"
        data-surface="dark"
        className="fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] text-text lg:hidden"
      >
        <ul className="flex h-16">
          {shown.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                    "transition-colors duration-[120ms] ease-standard focus-visible:outline-offset-[-4px]",
                    active ? "text-text" : "text-muted",
                  )}
                >
                  {active && <span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 rounded-b-sm bg-accent animate-fade" />}
                  <RegenIcon name={item.icon} size={22} className={active ? "text-accent-text" : undefined} />
                  <span className="max-w-full truncate px-1">{item.short}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
              className={cx(
                "relative flex h-16 w-full flex-col items-center justify-center gap-1 text-xs font-medium",
                "transition-colors duration-[120ms] ease-standard focus-visible:outline-offset-[-4px]",
                restActive ? "text-text" : "text-muted",
              )}
            >
              {restActive && <span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 rounded-b-sm bg-accent animate-fade" />}
              <RegenIcon name="menu" size={22} className={restActive ? "text-accent-text" : undefined} />
              Meny
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Meny" surface="dark">
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="pb-1 text-xs font-medium text-muted">{group.label}</p>
              <ul className="flex flex-col">
                {group.items.map((item) => {
                  const active = isActive(item.href, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMenu(false)}
                        className={cx(
                          "flex min-h-12 items-center gap-3 rounded-sm px-2 text-base focus-visible:outline-offset-[-2px]",
                          active ? "bg-sunken font-semibold" : "hover:bg-sunken",
                        )}
                      >
                        <RegenIcon name={item.icon} size={22} className={active ? "text-accent-text" : "text-muted"} />
                        <span className="flex min-w-0 flex-col">
                          <span>{item.label}</span>
                          <span className="text-xs text-muted">{item.hint}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-line pt-3">
          <UserPlate onSwitched={() => setMenu(false)} />
        </div>
      </Sheet>
    </>
  );
}
