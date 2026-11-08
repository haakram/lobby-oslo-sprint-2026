"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { usePicklist } from "@/features/picklist/PicklistProvider";
import { cx, PageHeader, RegenIcon, type RegenName } from "@/ui";
import { CleaningMode, type CleaningInitial } from "./CleaningMode";
import { useHotelMap } from "@/features/hotel";
import { PicklistMode } from "./PicklistMode";
import { parseCart, parseMode, parseRoomQuery, parseStart, type RouteMode } from "./query";
import { RobotMode } from "./RobotMode";
import type { RouteMatrix } from "./types";
import { useNightLog } from "./useNightLog";
import { replaceQuery } from "./urlState";

export type RouteParams = Partial<Record<"modus" | "rom" | "start" | "vogn" | "sku", string | string[]>>;

const MODES: { id: RouteMode; label: string; icon: RegenName; intro: string }[] = [
  { id: "renhold", label: "Renhold", icon: "route", intro: "Korteste runde for renholderne, på tvers av etasjer." },
  { id: "robot", label: "Robot", icon: "agent", intro: "Veien roboten gikk i natt, og hvor metrene gikk." },
  { id: "plukk", label: "Plukkliste", icon: "list-check", intro: "Korteste vei til alle varene på plukklisten, fra start og tilbake." },
];

/**
 * Ruter: route planning for the hotel. Renhold (the main use) plans the cleaners' round, Robot
 * shows where the robot walked tonight, Plukkliste keeps the pick-list route Øyne and Stemme feed.
 */
export function RoutesScreen({ params = {}, matrix }: { params?: RouteParams; matrix?: RouteMatrix }) {
  const baseId = useId();
  const { skus } = usePicklist();
  const sku = typeof params.sku === "string" ? params.sku : undefined;

  const initial = useMemo<CleaningInitial>(() => {
    const { rooms, unknown } = parseRoomQuery(params.rom);
    return { rooms, unknown, start: parseStart(params.start), cart: parseCart(params.vogn) };
  }, [params.rom, params.start, params.vogn]);

  // An explicit ?modus= wins; ?sku= (Øyne's "Vis vei": the way to one shelf) or a pick list in progress opens the pick list.
  const [mode, setMode] = useState<RouteMode>(
    () => parseMode(params.modus) ?? (sku || (skus.length > 0 && initial.rooms.length === 0) ? "plukk" : "renhold"),
  );
  const [opened, setOpened] = useState<ReadonlySet<RouteMode>>(() => new Set([mode]));
  const log = useNightLog("/runs/demo.jsonl", opened.has("renhold") || opened.has("robot"));
  // Tonight's hotel: the seed-1 base reshaped by the run log (seed 5 has rooms 321–334 on floor 3).
  // Until the log is in, or if it can't be read, it is the seed-1 base.
  const map = useHotelMap(log.status === "ready" ? log.lines : null);

  const choose = (next: RouteMode) => {
    setMode(next);
    setOpened((seen) => new Set(seen).add(next));
    replaceQuery({ modus: next });
  };

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const at = MODES.findIndex((m) => m.id === mode);
    const next = MODES[(at + step + MODES.length) % MODES.length].id;
    choose(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  const intro = MODES.find((m) => m.id === mode)?.intro;
  // The pick list's tab is always there (Holio pain 6): it opens on an example order when nobody has scanned yet.
  const shown = MODES;

  return (
    <main className="flex-1 px-4 pt-6 pb-12 sm:px-6 lg:px-10 lg:pt-10">
      <div className="mx-auto max-w-[1600px]">
        <PageHeader
          title="Ruter"
          lede={intro}
          actions={
          <div role="tablist" aria-label="Hva skal rutes" className={cx("grid w-full gap-0.5 rounded-sm bg-sunken p-0.5 sm:flex sm:w-auto", shown.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
            {shown.map((m) => {
              const active = m.id === mode;
              return (
                <button
                  key={m.id}
                  id={`${baseId}-tab-${m.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`${baseId}-panel-${m.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => choose(m.id)}
                  onKeyDown={onTabKey}
                  className={cx(
                    "inline-flex min-h-10 items-center justify-center gap-2 rounded-sm px-3 text-sm font-semibold sm:px-4 pointer-coarse:min-h-11",
                    "transition-colors duration-[120ms] ease-standard",
                    active ? "bg-surface text-text" : "text-muted hover:text-text",
                  )}
                >
                  <RegenIcon name={m.icon} size={18} className="hidden sm:block" />
                  {m.label}
                </button>
              );
            })}
          </div>
          }
        />

        {MODES.map((m) =>
          opened.has(m.id) ? (
            <div
              key={m.id}
              id={`${baseId}-panel-${m.id}`}
              role="tabpanel"
              aria-labelledby={`${baseId}-tab-${m.id}`}
              hidden={m.id !== mode}
              className="mt-6"
            >
              {m.id === "renhold" && <CleaningMode map={map} log={log} initial={initial} />}
              {m.id === "robot" && <RobotMode map={map} log={log} />}
              {m.id === "plukk" && <PicklistMode showSku={sku} matrix={matrix} />}
            </div>
          ) : null,
        )}
      </div>
    </main>
  );
}
