"use client";

import { useEffect, useState } from "react";
import { Button, cx, RegenIcon } from "@/ui";
import { minutesText } from "./cleaningPlan";
import { placeLabel, type HotelGraph } from "./hotelMap";
import { HotelPlan } from "./HotelPlan";
import type { RoomReport } from "./nightRooms";
import type { RobotTask, TaskStep } from "./robotWalk";

/** How long the walk stays on each stop while it plays (a replay runs at its own pace, DESIGN.md "Motion"). */
export const STEP_MS = 1400;

const nb = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

/** Step by step through a list: never starts by itself; plays, pauses, starts again. */
export function useStepPlayer(count: number) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = Math.max(0, count - 1);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      const next = Math.min(step + 1, last);
      setStep(next);
      if (next >= last) setPlaying(false);
    }, STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, step, last]);

  return {
    step,
    playing,
    /** Spill av: from the stop in view, or from the first again once it has reached the end. */
    play: () => {
      if (count <= 1) return;
      if (step >= last) setStep(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    restart: () => {
      setStep(0);
      setPlaying(count > 1);
    },
    goTo: (index: number) => {
      setStep(Math.max(0, Math.min(index, last)));
      setPlaying(false);
    },
  };
}

/** "Rom 104 · lever brett til 104" — or, for a ride, "Heis til 3. etasje". */
export function stepTitle(step: TaskStep): { place: string; doing: string | null } {
  if (step.ride) return { place: `Heis til ${step.ride.to}. etasje`, doing: `fra ${step.ride.from}. etasje` };
  return { place: placeLabel(step.node), doing: step.actions.length ? step.actions.join(", ") : null };
}

/**
 * One task's walk on the plan: the stops in order, numbered on the map and in the list, drawn stop by
 * stop under Spill av / Pause / Start på nytt. It opens paused on the first stop.
 */
export function TaskWalk({
  map,
  statuses,
  task,
  legend,
}: {
  map: HotelGraph;
  statuses: ReadonlyMap<string, RoomReport>;
  task: RobotTask;
  legend: React.ReactNode;
}) {
  const steps = task.steps;
  const player = useStepPlayer(steps.length);
  const current = steps[player.step];

  return (
    <div className="flex flex-col gap-4">
      {steps.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-2">
            {player.playing ? (
              <Button variant="secondary" onClick={player.pause}>
                <RegenIcon name="pause" size={20} />
                Pause
              </Button>
            ) : (
              <Button variant="secondary" onClick={player.play} disabled={steps.length <= 1}>
                <RegenIcon name="play" size={20} />
                Spill av
              </Button>
            )}
            <Button variant="ghost" onClick={player.restart} disabled={steps.length <= 1}>
              <RegenIcon name="repeat" size={20} />
              Start på nytt
            </Button>
          </div>
          <p aria-live="polite" className="text-sm text-muted">
            Stopp <span className="font-mono text-text tabular-nums">{player.step + 1}</span> av{" "}
            <span className="font-mono text-text tabular-nums">{steps.length}</span>
            {current && `: ${stepTitle(current).place}`}
          </p>
        </div>
      )}

      <HotelPlan
        map={map}
        label={`Hotellkart med veien for ${task.request}`}
        statuses={statuses}
        route={steps.map((s) => s.path)}
        pins={steps.map((s, i) => ({ node: s.node, label: String(i + 1), step: i }))}
        start={task.origin}
        selected={task.room ? new Set([task.room]) : undefined}
        drawToken={0}
        progress={player.step}
        legend={legend}
      />

      {steps.length === 0 ? (
        <p className="text-base text-muted">Roboten gjorde ingenting på et annet sted for denne oppgaven.</p>
      ) : (
        <div>
          {task.origin && (
            <p className="text-sm text-muted">
              Start: <span className="text-text">{placeLabel(task.origin)}</span>
              {task.start && ` · ${task.start.slice(0, 5)}`}
            </p>
          )}
          <ol aria-label="Stoppene på veien" className="mt-2 gap-x-8 sm:columns-2">
            {steps.map((s, i) => {
              const { place, doing } = stepTitle(s);
              const active = i === player.step;
              const ahead = i > player.step;
              return (
                <li key={`${i}-${s.node}`} className="break-inside-avoid border-b border-line">
                  <button
                    type="button"
                    aria-current={active ? "step" : undefined}
                    onClick={() => player.goTo(i)}
                    className={cx(
                      "flex min-h-12 w-full items-start gap-3 rounded-md px-2 py-2.5 text-left",
                      "transition-colors duration-[120ms] ease-standard",
                      active ? "bg-accent-soft" : "hover:bg-sunken",
                    )}
                  >
                    <span
                      className={cx(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border-2 font-mono text-sm font-medium tabular-nums",
                        ahead ? "border-accent bg-surface text-accent-text" : "border-accent bg-accent text-on-accent",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base">
                        <span className="font-semibold">{place}</span>
                        {doing && <span className="text-muted"> · {doing}</span>}
                      </span>
                      <span className="block text-sm text-muted">
                        {s.metres > 0 ? (
                          <span className="whitespace-nowrap">
                            <span className="font-mono tabular-nums">{nb.format(s.metres)}</span> m
                          </span>
                        ) : (
                          "Samme sted"
                        )}
                        {s.seconds !== null && (
                          <>
                            {" · "}
                            <span className="whitespace-nowrap">{minutesText(s.seconds)}</span>
                          </>
                        )}
                        {i === 0 ? " fra start" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
