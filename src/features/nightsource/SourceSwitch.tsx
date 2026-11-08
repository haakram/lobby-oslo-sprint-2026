"use client";

import { cx } from "@/ui";
import type { WithoutRobot } from "./compose";
import type { NightSource } from "./useNightSource";

const OPTIONS: readonly { id: NightSource; label: string }[] = [
  { id: "robot", label: "Med robot" },
  { id: "none", label: "Uten robot" },
];

/** "4 registreringer fra nattevakten (4 eksempler)". */
function clerkCount(sources: WithoutRobot["sources"]): string {
  const { staffEntries, samples } = sources;
  const count = `${staffEntries} ${staffEntries === 1 ? "registrering" : "registreringer"} fra nattevakten`;
  if (samples === 0) return count;
  return `${count} (${samples === staffEntries ? (samples === 1 ? "et eksempel" : "eksempler") : `${samples} av dem eksempler`})`;
}

/**
 * Which night Overlevering is built from (round 5, product, founders and marketing reviews: "hotel number one needs no
 * robot", shown, not told): *Med robot* is the robot's run log; *Uten robot* is the same page from the
 * booking system, the door lock's one signal per room and the night clerk's own entries. The same
 * pressed-button pair as Natteskift's *Robotlogg*. Under *Uten robot*, one quiet line says what the page
 * now rests on and what of it is test data.
 */
export function SourceSwitch({
  value,
  onChange,
  sources,
  className,
}: {
  value: NightSource;
  onChange: (next: NightSource) => void;
  /** The robot-free night's sources (useWithoutRobot().sources), for the line under *Uten robot*. */
  sources?: WithoutRobot["sources"] | null;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 print:hidden">
        <span id="night-source-label" className="text-sm text-muted">
          Natten fra
        </span>
        <div role="group" aria-labelledby="night-source-label" className="inline-flex gap-0.5 rounded-sm bg-sunken p-0.5">
          {OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={value === id}
              onClick={() => onChange(id)}
              className={cx(
                "min-h-10 rounded-sm px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-[120ms] ease-standard pointer-coarse:min-h-11",
                value === id ? "bg-surface text-text" : "text-muted hover:text-text",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {value === "none" && (
        <p aria-live="polite" className="max-w-[72ch] text-xs text-muted">
          Uten robot: bookingsystemet, dørlåsen (ett signal per rom, aldri hvem){sources ? ` og ${clerkCount(sources)}` : " og nattevaktens logg"}. Bookingene og dørlåsen er
          testdata.
        </p>
      )}
    </div>
  );
}
