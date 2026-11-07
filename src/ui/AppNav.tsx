"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";
import { EyeIcon, MicIcon, MoonIcon, PhoneIcon, RouteIcon } from "./icons";
import { DURATION, EASE } from "./motion";

const TABS = [
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
        aria-current={pathname === "/" ? "page" : undefined}
        className="hidden h-20 items-center justify-center text-base font-extrabold tracking-tight focus-visible:outline-offset-[-4px] lg:flex"
      >
        Fettero
      </Link>
      <ul className="grid h-16 grid-cols-5 lg:h-auto lg:grid-cols-1 lg:gap-1 lg:px-2">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
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
                      "absolute inset-x-5 top-0 h-1 rounded-b-sm bg-accent",
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
