"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";
import { EyeIcon, MicIcon, MoonIcon, PhoneIcon, RouteIcon } from "./icons";
import { RegenIcon } from "./icons/RegenIcon";
import { DURATION, EASE } from "./motion";

// The hotel oversight tabs use Regen icons (DESIGN.md "Hotel oversight additions").
const OverviewIcon = () => <RegenIcon name="layout-grid" />;
const HotelIcon = () => <RegenIcon name="layers" />;

const TABS = [
  { href: "/", label: "Oversikt", Icon: OverviewIcon },
  { href: "/hotell", label: "Hotell", Icon: HotelIcon },
  { href: "/oyne", label: "Øyne", Icon: EyeIcon },
  { href: "/ruter", label: "Ruter", Icon: RouteIcon },
  { href: "/stemme", label: "Stemme", Icon: MicIcon },
  { href: "/resepsjon", label: "Resepsjon", Icon: PhoneIcon },
  { href: "/natteskift", label: "Natteskift", Icon: MoonIcon },
] as const;

/**
 * Bottom tab bar on phones, side rail from 1024 px. Always on the dark surface,
 * like the handle of a scanner. The active tab carries the orange floor tape.
 */
export function AppNav() {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  return (
    <nav
      aria-label="Hovedmeny"
      data-surface="dark"
      className={cx(
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]",
        "lg:sticky lg:top-0 lg:h-dvh lg:w-24 lg:shrink-0 lg:border-t-0 lg:border-r lg:pb-0",
      )}
    >
      <Link
        href="/"
        className="hidden h-20 items-center justify-center text-base font-extrabold tracking-tight focus-visible:outline-offset-[-4px] lg:flex"
      >
        Lobby
      </Link>
      {/* Seven tabs on a phone: each takes its label's width plus an even share of the rest (at least 44 px). */}
      <ul className="flex h-16 lg:grid lg:h-auto lg:grid-cols-1 lg:gap-1 lg:px-2">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="min-w-11 flex-auto lg:min-w-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium tracking-[-0.01em]",
                  "transition-colors duration-150 ease-standard focus-visible:outline-offset-[-4px]",
                  "lg:h-18 lg:rounded-md",
                  active ? "text-text" : "text-muted hover:text-text",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-tape"
                    aria-hidden="true"
                    transition={{ duration: reduced ? 0 : DURATION.base, ease: EASE }}
                    className={cx(
                      "absolute inset-x-3 top-0 h-1 rounded-b-sm bg-accent",
                      "lg:inset-x-auto lg:inset-y-3 lg:-left-2 lg:h-auto lg:w-1 lg:rounded-b-none lg:rounded-r-sm",
                    )}
                  />
                )}
                <Icon />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
