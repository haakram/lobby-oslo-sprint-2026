import { Badge, Card, Skeleton } from "@/ui";
import { hhmm, percent } from "./format";
import { itemLabel, OUTCOME, placeLabel, requestKindLabel } from "./labels";
import { RobotPanel } from "./RobotPanel";
import type { RobotView, RoomView, Task } from "./selectors";

const QUEUE_SHOWN = 3;

function list(items: string[]): string {
  return items.length ? items.map(itemLabel).join(", ") : "ingenting";
}

/** Roboten nå: where it is, what it is doing or did last, what waits, what it carries. */
export function RobotNow({
  robot,
  rooms,
  className,
}: {
  robot: RobotView | null;
  rooms: RoomView[] | null;
  className?: string;
}) {
  const state = !robot ? null : robot.ended ? { word: "Skift slutt", tone: "neutral" as const } : robot.current ? { word: "Jobber", tone: "accent" as const } : { word: "Ledig", tone: "success" as const };

  return (
    <section aria-labelledby="robot-heading" data-enter className={className}>
      <Card className="flex flex-col gap-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="robot-heading" className="text-2xl font-bold tracking-[-0.02em]">
            Roboten nå
          </h2>
          {state && <Badge tone={state.tone}>{state.word}</Badge>}
        </div>

        {robot && rooms ? <RobotPanel robot={robot} rooms={rooms} /> : <Skeleton className="aspect-[16/10] w-full" />}

        {robot ? (
          <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Batteri</dt>
              <dd className="font-mono tabular-nums">{percent(robot.battery)}</dd>
              <dt className="text-muted">I hendene</dt>
              <dd>{list(robot.hands)}</dd>
              <dt className="text-muted">I vogna</dt>
              <dd>{list(robot.cart)}</dd>
            </dl>

            {robot.current || robot.last ? (
              <TaskCard
                heading={robot.current ? "Nå" : "Siste oppgave"}
                task={(robot.current ?? robot.last) as Task}
                ended={robot.ended}
              />
            ) : (
              <p className="text-base text-muted">Roboten har ikke fått noen oppgaver ennå.</p>
            )}

            <div>
              <h3 className="text-sm font-semibold text-muted">Neste i køen</h3>
              {robot.queue.length === 0 ? (
                <p className="mt-1 text-base text-muted">
                  {robot.ended ? "Skiftet er over. Ingen oppgaver venter." : "Ingen oppgaver venter."}
                </p>
              ) : (
                <ol className="mt-2 flex flex-col gap-2">
                  {robot.queue.slice(0, QUEUE_SHOWN).map((request) => (
                    <li key={request.request} className="flex flex-wrap items-baseline gap-x-2 text-base">
                      <span className="font-mono text-sm text-muted">{request.request}</span>
                      <span className="font-semibold">{requestKindLabel(request.kind)}</span>
                      {request.text && (
                        <span lang="en" className="min-w-0 truncate text-sm text-muted">
                          {request.text}
                        </span>
                      )}
                    </li>
                  ))}
                  {robot.queue.length > QUEUE_SHOWN && (
                    <li className="text-sm text-muted">og {robot.queue.length - QUEUE_SHOWN} til</li>
                  )}
                </ol>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
      </Card>
    </section>
  );
}

function TaskCard({ heading, task, ended }: { heading: string; task: Task; ended: boolean }) {
  const outcome = task.outcome === "running" && ended ? { word: "Ikke ferdig", tone: "neutral" as const } : OUTCOME[task.outcome];
  const times = [task.startedAt && `startet ${hhmm(task.startedAt)}`, task.endedAt && `ferdig ${hhmm(task.endedAt)}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-md bg-sunken p-4">
      <h3 className="text-sm font-semibold text-muted">{heading}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold">{requestKindLabel(task.kind)}</span>
        <span className="font-mono text-sm text-muted">{task.request}</span>
        <Badge tone={outcome.tone}>{outcome.word}</Badge>
      </div>
      <p className="mt-1 text-base">
        {task.room ? placeLabel(task.room) : "Ingen rom oppgitt"}
        {task.item && <span className="text-muted"> · med {itemLabel(task.item)}</span>}
      </p>
      {task.text && (
        <blockquote lang="en" className="mt-3 border-l-2 border-line-strong pl-3 text-sm text-muted">
          {task.text}
        </blockquote>
      )}
      {times && <p className="mt-3 font-mono text-xs text-muted tabular-nums">{times}</p>}
    </div>
  );
}
