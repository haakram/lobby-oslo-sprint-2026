import { Badge, Skeleton } from "@/ui";
import { hhmm, percent } from "./format";
import { placeLabel, requestKindLabel } from "./labels";
import type { RobotView } from "./selectors";
import type { RunSource } from "./useDashboardRun";
import { VantaBackdrop } from "./VantaBackdrop";

export const HOTEL_NAME = "Hotell Nattskift";

/** What the robot is doing, in a few words: "Romservice til rom 104". */
export function robotDoing(robot: RobotView): string {
  if (robot.ended) return "Skiftet er over";
  const task = robot.current;
  if (!task) return "Ledig, venter på oppgaver";
  const where = task.room ? ` til ${placeLabel(task.room).toLowerCase()}` : "";
  return `${requestKindLabel(task.kind)}${where}`;
}

/**
 * The band on top of the desk: the hotel, the night, the shift clock set large, and the robot in
 * one line. The fog sits behind the band only, in umber tones that never leave the dark range,
 * so the ivory text reads everywhere on it.
 */
export function DashboardHeader({
  night,
  robot,
  source,
  loading,
}: {
  night: string | null;
  robot: RobotView | null;
  source: RunSource;
  loading: boolean;
}) {
  return (
    <header data-surface="dark" className="relative isolate overflow-hidden bg-bg">
      <VantaBackdrop />
      <div className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 pt-8 pb-8 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:pt-12 lg:pb-10">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-medium tracking-[-0.01em] sm:text-3xl">{HOTEL_NAME}</h1>
          <p className="mt-3 text-base text-muted">{night ?? "Natten"} · overlevering 06:00</p>
        </div>

        <div className="flex flex-col gap-x-10 gap-y-5 sm:flex-row sm:items-end">
          <div className="min-w-0 sm:max-w-[420px]">
            <span className="text-xs text-muted">Roboten</span>
            {loading ? (
              <Skeleton className="mt-2 h-5 w-64" />
            ) : !robot ? (
              <p className="mt-1 text-base text-muted">Ingen data fra natten</p>
            ) : (
              // Wraps between the three facts, never inside one.
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-base">
                <li className="font-semibold whitespace-nowrap">{robot.location ? placeLabel(robot.location) : "Ukjent sted"}</li>
                <li className="whitespace-nowrap">{robotDoing(robot)}</li>
                <li className="whitespace-nowrap">
                  <span className="text-muted">Batteri </span>
                  <span className="tabular-nums">{percent(robot.battery)}</span>
                </li>
              </ul>
            )}
          </div>
          <div className="shrink-0 sm:border-l sm:border-line sm:pl-10">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Skiftklokke</span>
              <Badge tone={source === "live" ? "accent" : "neutral"}>{source === "live" ? "Direkte" : "Opptak"}</Badge>
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-12 w-36" />
            ) : (
              <p className="mt-1 font-display text-3xl leading-none font-medium whitespace-nowrap tabular-nums">{hhmm(robot?.clock)}</p>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
