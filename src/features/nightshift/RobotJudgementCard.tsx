"use client";

import { type ReactNode, useMemo } from "react";
import { placeName } from "@/features/replay";
import { cx, RegenIcon, type RegenName } from "@/ui";
import { type RobotJudgement, robotJudgement } from "./judgement";
import type { RunLine } from "./runlog";

/**
 * "Robotens vurderinger i natt": the calls the robot made on its own, from its run log, in the
 * hotel's words. The refusals of the stranger come first, as one security incident with its times;
 * then every "done" against the server's confirmation, the claims it checked and declined, the
 * wet floors and the Do-Not-Disturb doors. Calm and factual: green only where the figure is good,
 * no red or amber (DESIGN.md, where colour goes; what needs a person is in the bell).
 *
 * Natteskift passes `until` (the replay's sim second) so the card follows the scrubber; Overlevering
 * shows the whole night.
 */
export function RobotJudgementCard({
  lines,
  until,
  asOf,
  id = "vurderinger",
  className,
}: {
  lines: readonly RunLine[];
  /** Sim seconds since 22:00; the card counts only what happened by then. */
  until?: number;
  /** "03:12": shown as "fram til 03:12" while the night is not over. */
  asOf?: string | null;
  id?: string;
  className?: string;
}) {
  const judgement = useMemo(() => robotJudgement(lines, until), [lines, until]);
  return <RobotJudgementView judgement={judgement} asOf={asOf} id={id} className={className} />;
}

export function RobotJudgementView({
  judgement,
  asOf,
  id = "vurderinger",
  className,
}: {
  judgement: RobotJudgement;
  asOf?: string | null;
  id?: string;
  className?: string;
}) {
  const { strangers, done, declined, wetFloors, doNotDisturb } = judgement;
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className={cx("scroll-mt-6 rounded-lg border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-lg font-semibold tracking-[-0.01em]">
          Robotens vurderinger i natt
        </h2>
        <p className="text-sm text-muted">{asOf ? `Fra robotens logg, fram til ${asOf.slice(0, 5)}` : "Fra robotens logg"}</p>
      </div>

      {strangers.refusals.length > 0 && <StrangerIncident strangers={strangers} />}

      <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 border-t border-line pt-4 md:grid-cols-2">
        <Row
          icon="circle-check"
          figure={
            done.reported > 0 ? (
              <>
                {done.confirmed} <span className="font-sans text-base font-normal">av</span> {done.reported}
              </>
            ) : (
              "0"
            )
          }
          good={done.reported > 0 && done.confirmed === done.reported}
          label="«Ferdig» bekreftet av Wybe-serveren"
        >
          {done.reported === 0
            ? "Roboten har ikke meldt noe ferdig ennå."
            : done.confirmed === done.reported
              ? "Roboten melder bare ferdig når serveren har godtatt leveransen."
              : `${done.reported - done.confirmed} meldt ferdig uten bekreftelse; de telles ikke som fullført.`}
        </Row>
        <Row icon="search" figure={String(declined.total)} label={declined.total === 1 ? "Melding avvist etter sjekk" : "Meldinger avvist etter sjekk"}>
          {declined.total === 0 ? "Ingen meldinger måtte avvises." : `${declineText(declined)}. Roboten sjekket først og gjorde ikke noe unødvendig.`}
        </Row>
        <Row icon="flag" figure={String(wetFloors.signed.length)} label="Skilt for vått gulv satt ut">
          {wetFloors.signed.length > 0 ? `${places(wetFloors.signed)}.` : wetFloors.found.length > 0 ? "Ingen skilt satt ut." : "Ingen våte gulv funnet."}
          {wetFloors.unsignedAtEnd.length > 0 && (
            <span className="mt-1 block">Vått uten skilt ved slutten: {places(wetFloors.unsignedAtEnd).toLowerCase()}.</span>
          )}
        </Row>
        <Row
          icon="moon"
          figure={doNotDisturb.rooms.length > 0 ? String(doNotDisturb.entered.length) : undefined}
          good={doNotDisturb.rooms.length > 0 && doNotDisturb.entered.length === 0}
          label={doNotDisturb.rooms.length > 0 ? "Rom med Ikke forstyrr gått inn i" : "Ikke forstyrr"}
        >
          {doNotDisturb.rooms.length === 0
            ? "Ingen dører hadde Ikke forstyrr-skilt i natt."
            : doNotDisturb.entered.length === 0
              ? `${joinNo(doNotDisturb.rooms.map(place))} hadde skiltet. Roboten gikk ikke inn.`
              : `Roboten gikk inn i ${joinNo(doNotDisturb.entered.map(place))} etter at skiltet var sett.`}
        </Row>
      </ul>
    </section>
  );
}

function StrangerIncident({ strangers }: { strangers: RobotJudgement["strangers"] }) {
  const { refusals, rooms, keycardWaits, reply } = strangers;
  const times = refusals.map((refusal) => refusal.clock.slice(0, 5));
  const span = times.length > 1 ? `mellom ${times[0]} og ${times.at(-1)}` : `kl. ${times[0]}`;
  const count = refusals.length;
  const roomsText = rooms.length > 1 ? `${rooms.length} ulike rom` : rooms.length === 1 ? `rom ${rooms[0]}` : "et rom";
  return (
    <div className="mt-4 flex gap-3 sm:gap-4">
      <RegenIcon name="shield-check" size={24} className="mt-0.5 shrink-0 text-success" />
      <div className="min-w-0">
        <p className="text-sm text-muted">Sikkerhet · én hendelse</p>
        <p className="mt-0.5 text-base font-semibold sm:text-lg">
          Sa nei <span className="font-mono font-medium tabular-nums">{count}</span> {count === 1 ? "gang" : "ganger"} til en ukjent person
        </p>
        <p className="mt-1 max-w-[72ch] text-base text-muted">
          En mann i badekåpe ba roboten slippe ham inn i {roomsText} {span}. Roboten sa nei hver gang, ga ikke fra seg nøkkelkort og fulgte ikke etter.
          {keycardWaits.length > 0 &&
            ` ${keycardWaits.length === 1 ? "Én gang" : `${capitalise(countWord(keycardWaits.length))} ganger`} ventet den med å låse opp ${joinNo(
              [...new Set(keycardWaits)].map(place).map((name) => name.toLowerCase()),
            )} til han var borte.`}{" "}
          Samme person ved flere dører: nattevakten bør vite om det.
        </p>
        {reply && (
          <p className="mt-2 max-w-[72ch] text-sm text-muted">
            Roboten svarte (engelsk):{" "}
            <q lang="en" className="text-text">
              {reply}
            </q>
          </p>
        )}
        <ol aria-label="Når og hvor" className="mt-2 flex flex-wrap gap-1.5">
          {refusals.map((refusal, index) => (
            <li key={index} className="rounded-sm bg-sunken px-2 py-1 font-mono text-sm text-text tabular-nums sm:text-xs">
              {refusal.clock.slice(0, 5)}
              {/* On a phone "rom" goes, so the seven fit in two rows instead of seven. */}
              {refusal.room && (
                <span className="text-muted">
                  {" "}
                  · <span className="max-sm:sr-only">rom </span>
                  {refusal.room}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Row({ icon, figure, label, good = false, children }: { icon: RegenName; figure?: ReactNode; label: string; good?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <RegenIcon name={icon} size={20} className={cx("mt-1 shrink-0", good ? "text-success" : "text-muted")} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          {figure !== undefined && <span className={cx("font-mono text-xl font-medium tabular-nums", good ? "text-success" : "text-text")}>{figure}</span>}
          <span className="font-semibold">{label}</span>
        </p>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
      </div>
    </li>
  );
}

function place(id: string): string {
  return placeName(id);
}

/** "Korridor 3d, 3a og 2a" for corridors; place names joined otherwise. */
function places(ids: readonly string[]): string {
  if (ids.length > 1 && ids.every((id) => id.startsWith("corridor-"))) return `Korridor ${joinNo(ids.map((id) => id.slice(9)))}`;
  return joinNo(ids.map(place));
}

function declineText(declined: RobotJudgement["declined"]): string {
  const parts: string[] = [];
  if (declined.noOrder) parts.push(`${declined.noOrder} ${declined.noOrder === 1 ? "klage på en bestilling" : "klager på bestillinger"} som ikke fantes`);
  if (declined.alreadyDone) parts.push(`${declined.alreadyDone} ${declined.alreadyDone === 1 ? "levering" : "leveringer"} som alt var gjort`);
  if (declined.nothingNew) parts.push(`${declined.nothingNew} søl uten noe nytt å gjøre`);
  if (declined.other) parts.push(`${declined.other} annet`);
  return capitalise(joinNo(parts));
}

/** "a, b og c". */
export function joinNo(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} og ${items.at(-1)}`;
}

const WORDS = ["null", "én", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti"];
function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

function capitalise(text: string): string {
  return text.charAt(0).toLocaleUpperCase("nb-NO") + text.slice(1);
}
