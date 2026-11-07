"use client";

import { type ReactNode, useRef } from "react";
import { useEntrance } from "@/features/dashboard/useEntrance";
import { type ModuleId, moduleById } from "@/features/modules/registry";
import { cx, PageHeader } from "@/ui";

/**
 * The frame every module screen shares: the module's name as the title, one line on what it is,
 * the screen's actions on the right, then the work. Panels marked `data-enter` rise once when
 * `ready` turns true (DESIGN.md "Motion").
 */
export function ModulePage({
  module,
  lede,
  meta,
  actions,
  ready = true,
  surface,
  className,
  children,
}: {
  module: ModuleId;
  lede?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  ready?: boolean;
  surface?: "light" | "dark";
  className?: string;
  children: ReactNode;
}) {
  const scope = useRef<HTMLDivElement>(null);
  useEntrance(scope, ready);
  const definition = moduleById(module);
  return (
    <main data-surface={surface} className={cx("flex-1", surface && "bg-bg text-text")}>
      <div ref={scope} className={cx("mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:gap-8 lg:px-10 lg:py-8", className)}>
        <PageHeader title={definition.name} lede={lede ?? definition.hint} meta={meta} actions={actions} />
        {children}
      </div>
    </main>
  );
}

/** A figure row's frame: four or more figures along one rule. */
export function FigureRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section aria-label={label} data-enter>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 sm:grid-cols-4 lg:gap-x-10">{children}</div>
    </section>
  );
}

/** A panel's header row: the name, a line on it, and the panel's own action on the right. */
export function PanelHead({ id, title, note, action, count }: { id: string; title: string; note?: string; action?: ReactNode; count?: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 id={id} className="flex items-baseline gap-2 text-lg font-semibold tracking-[-0.01em]">
        {title}
        {count !== undefined && <span className="text-base font-normal text-muted tabular-nums">{count}</span>}
      </h2>
      {note && !action && <p className="text-sm text-muted">{note}</p>}
      {action}
    </div>
  );
}
