import { Badge, cx, RegenIcon, Skeleton } from "@/ui";
import { hhmm, percent } from "./format";
import { placeLabel, requestKindLabel } from "./labels";
import type { RobotView } from "./selectors";
import type { DashboardRun } from "./useDashboardRun";

export const HOTEL_NAME = "Hotell Nattskift";
export const LOW_BATTERY = 20;

/** What the robot is doing, in a few words: "Romservice til rom 104". */
export function robotDoing(robot: RobotView): string {
  if (robot.ended) return "Skiftet er over";
  const task = robot.current;
  if (!task) return "Venter på oppgave";
  const where = task.room ? ` til ${placeLabel(task.room).toLowerCase()}` : "";
  return `${requestKindLabel(task.kind)}${where}`;
}

export function batteryLow(robot: RobotView | null): boolean {
  return robot?.battery !== null && robot?.battery !== undefined && robot.battery < LOW_BATTERY;
}

const OSLO_CLOCK = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });

export type RunState = Pick<DashboardRun, "source" | "ended" | "lostAfter">;

/**
 * Where the night on screen comes from, said plainly: the recording, a shift running now, a live
 * shift that has ended, or one the viewer stopped answering for (with the time it last answered).
 */
export function RunBadge({ run }: { run: RunState }) {
  if (run.source === "demo") return <Badge>Opptak</Badge>;
  if (run.lostAfter !== null) return <Badge tone="danger">Mistet kontakt · sist {OSLO_CLOCK.format(run.lostAfter)}</Badge>;
  if (run.ended) return <Badge>Natten er over</Badge>;
  return <Badge tone="accent">Direkte</Badge>;
}

/**
 * The 64 px bar on top of the desk (UX audit, Oversikt 4): the hotel and the night on the left,
 * the shift clock in the display face and the robot's chip on the right. No hero, no fog.
 */
export function TopBar({
  night,
  robot,
  run,
  loading,
}: {
  night: string | null;
  robot: RobotView | null;
  run: RunState;
  loading: boolean;
}) {
  const low = batteryLow(robot);
  return (
    <header data-surface="dark" className="border-b border-line bg-bg">
      <div className="mx-auto flex min-h-16 w-full max-w-[1600px] flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-2 sm:px-6 lg:px-10">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-base font-semibold">{HOTEL_NAME}</span>
          <span className="text-sm text-muted">{night ?? "Natten"} · overlevering 06:00</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {loading ? (
            <Skeleton className="h-6 w-64" />
          ) : robot ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <RegenIcon name="agent" size={18} className="text-accent-text" />
              <span className="font-semibold">{robot.location ? placeLabel(robot.location) : "Ukjent sted"}</span>
              {/* Each dot rides with what follows it, so a wrapped line never ends in an orphan "·". */}
              <span>
                <span aria-hidden="true" className="text-muted">
                  ·{" "}
                </span>
                {robotDoing(robot)}
              </span>
              <span className={cx("inline-flex items-center gap-1 tabular-nums", low ? "font-semibold text-warning" : "text-muted")}>
                <span aria-hidden="true" className="text-muted">
                  ·
                </span>
                <RegenIcon name={low ? "battery-low" : "battery"} size={16} />
                {low ? `Lavt batteri ${percent(robot.battery)}` : percent(robot.battery)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted">Ingen data fra natten</span>
          )}
          <div className="flex items-center gap-2">
            <RunBadge run={run} />
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <span className="font-mono text-xl leading-none font-medium whitespace-nowrap tabular-nums">
                <span className="sr-only">Skiftklokke </span>
                {hhmm(robot?.clock)}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
