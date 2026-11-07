"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { RegenIcon } from "./icons/RegenIcon";
import { DURATION, sheetIn } from "./motion";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * A bottom sheet for a result, a confirmation or the phone's Meny. The close button (focused on
 * open), Escape and the scrim close it; Tab stays inside it; a tall sheet scrolls inside itself so
 * the title and the close button never leave the screen. `surface="dark"` paints it night steel.
 */
export function Sheet({
  open,
  onClose,
  title,
  surface,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  surface?: "light" | "dark";
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Callers pass inline handlers; keep the latest in a ref so the open effect
  // below runs once per open, not on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Something inside (an open menu) already handled this Escape: leave the sheet open.
        if (!event.defaultPrevented) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      // Keep Tab inside the dialog: from the last stop back to the first, and the other way round.
      const stops = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((stop) => stop.tabIndex >= 0);
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      if (!panel.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : DURATION.base }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-surface={surface}
            variants={sheetIn(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative flex max-h-[calc(100dvh-16px)] w-full max-w-xl flex-col rounded-t-md bg-surface pt-3 text-text"
          >
            <div aria-hidden="true" className="mx-auto h-1 w-10 shrink-0 rounded-full bg-line-strong" />
            <div className="flex shrink-0 items-center justify-between gap-4 pr-2 pl-5">
              <h2 id={titleId} className="text-lg font-semibold tracking-[-0.01em]">
                {title}
              </h2>
              <button
                ref={closeButton}
                type="button"
                onClick={onClose}
                aria-label="Lukk"
                className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-[120ms] ease-standard hover:bg-sunken hover:text-text focus-visible:outline-offset-[-2px]"
              >
                <RegenIcon name="x" size={22} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-[calc(24px+env(safe-area-inset-bottom))]">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
