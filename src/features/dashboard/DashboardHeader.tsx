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
 * The dark band on top: the product, the hotel, the night and the robot in one line. The fog sits
 * behind the band only; the clock and the robot line sit on a solid surface (DESIGN.md: no
 * backdrop behind text that must read at 4.5:1).
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
    <header data-surface="dark" className="relative isolate overflow-hidden border-b border-line bg-bg">
      <VantaBackdrop />
      <div className="relative z-10 flex flex-col gap-6 px-4 pt-8 pb-6 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-12 lg:pt-12 lg:pb-8">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.045em] sm:text-3xl">Lobby</h1>
          <div aria-hidden="true" className="mt-3 h-1 w-12 bg-accent" />
          <p className="mt-4 text-xl font-semibold tracking-[-0.02em]">{HOTEL_NAME}</p>
          <p className="mt-1 text-base text-muted">
            {night ?? "Natten"} · overlevering 06:00
          </p>
        </div>

        <div className="flex w-full flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:gap-6 lg:w-auto lg:max-w-[640px]">
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Skiftklokke</span>
              <Badge tone={source === "live" ? "accent" : "neutral"}>{source === "live" ? "Direkte" : "Opptak"}</Badge>
            </div>
            {loading ? (
              <Skeleton className="mt-1 h-8 w-28" />
            ) : (
              <p className="mt-1 font-mono text-2xl font-medium whitespace-nowrap tabular-nums">{hhmm(robot?.clock)}</p>
            )}
          </div>
          <div aria-hidden="true" className="hidden h-14 w-px bg-line sm:block" />
          <div className="min-w-0">
            <span className="text-sm text-muted">Roboten</span>
            {loading ? (
              <Skeleton className="mt-2 h-5 w-64" />
            ) : !robot ? (
              <p className="mt-1 text-base text-muted">Ingen data fra natten</p>
            ) : (
              // Wraps between the three facts, never inside one.
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-base">
                <li className="font-semibold whitespace-nowrap">
                  {robot.location ? placeLabel(robot.location) : "Ukjent sted"}
                </li>
                <li className="whitespace-nowrap">{robotDoing(robot)}</li>
                <li className="whitespace-nowrap">
                  <span className="text-muted">Batteri </span>
                  <span className="font-mono tabular-nums">{percent(robot.battery)}</span>
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
