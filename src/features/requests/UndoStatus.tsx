"use client";

import { useEffect, useRef } from "react";
import { Button, cx } from "@/ui";

/**
 * The line that says what an action just did and where the row went, with *Angre*. It takes the
 * focus when it appears, so a keyboard or screen-reader user isn't dropped on the page when the row
 * moves to another group (WCAG 2.4.3), and the undo is never hidden in a collapsed list.
 * Mount it with a new `key` per action.
 */
export function UndoStatus({
  message,
  onUndo,
  undoLabel,
  takeFocus = true,
  className,
}: {
  message: string;
  onUndo: () => void;
  /** Accessible name of *Angre* when the word alone isn't enough. */
  undoLabel?: string;
  /** False when the row stayed where it was (and its button kept the focus). */
  takeFocus?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (takeFocus) box.current?.querySelector("button")?.focus();
  }, [takeFocus]);
  return (
    <p ref={box} role="status" className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-sunken py-1 pr-1 pl-4 text-sm", className)}>
      <span className="min-w-0 flex-1">{message}</span>
      <Button variant="ghost" size="sm" onClick={onUndo} aria-label={undoLabel}>
        Angre
      </Button>
    </p>
  );
}

/** After *Angre*, the row is back where it was: put the focus on its action again. */
export function focusAction(scope: HTMLElement | null, id: string) {
  const target = scope?.querySelector<HTMLElement>(`[data-action-for="${id.replace(/"/g, '\\"')}"]`);
  target?.focus();
}
