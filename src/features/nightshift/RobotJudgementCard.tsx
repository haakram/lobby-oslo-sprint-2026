"use client";

import Link from "next/link";
import { type ReactNode, useMemo } from "react";
import { placeName } from "@/features/replay";
import { cx, RegenIcon, type RegenName } from "@/ui";
import {
  type DoneBasis,
  doneBasis,
  type MasterKeyEntries,
  masterKeyEntries,
  type SignMove,
  type SlipCrossing,
  signsMovedOffWet,
  slipCrossings,
  type UnfinishedTask,
  unfinishedTasks,
} from "./conduct";
import { type DeclineSplit, declineSplit, declineSplitPlain } from "./declines";
import { type RobotJudgement, robotJudgement } from "./judgement";
import { type CrossNight, crossNightPrecision, grouped, LEDGER_META, percentText, shiftOf } from "./ledger";
import type { RunLine } from "./runlog";

/**
 * "Robotens vurderinger i natt": the calls the robot made on its own, from its run log, in the
 * hotel's words. The refusals of the stranger come first, as one security incident with its times;
 * then every "done" split by what it rested on (jury round 4, the data juror and the Wybe juror): said on the robot's own
 * judgement (room checks, spills: no score rise during the task) or only after the simulator had
 * confirmed the work, with one line on what confirms "done" in a real hotel (the Holio juror); the refusals,
 * in a manager's words, handed to reception where a guest may still want the thing; the wet floors with
 * the slip and the moved sign; the master-key entries without a knock (the Wybe juror); the Do-Not-Disturb doors.
 * The referee, the cross-night figures from the evidence ledger, commit hashes and repo paths sit behind
 * "Slik vet vi det" (the design juror), off the manager's main read. Calm and factual: green only where the
 * figure is good, no red or amber (DESIGN.md, where colour goes; what needs a person is in the bell).
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
  const declines = useMemo(() => declineSplit(lines, until), [lines, until]);
  const basis = useMemo(() => doneBasis(lines, until), [lines, until]);
  const conduct = useMemo(
    () => ({
      keys: masterKeyEntries(lines, until),
      slips: slipCrossings(lines, until),
      signMoves: signsMovedOffWet(lines, until),
      unfinished: unfinishedTasks(lines, until),
    }),
    [lines, until],
  );
  const source = useMemo(() => sourceOf(lines), [lines]);
  // The ledger counts the Wybe simulator's live nights; another producer's log has no place in it.
  const crossNight = useMemo(() => (source ? undefined : crossNightPrecision(shiftOf(lines))), [lines, source]);
  return (
    <RobotJudgementView
      judgement={judgement}
      declines={declines}
      basis={basis}
      conduct={conduct}
      crossNight={crossNight}
      source={source}
      asOf={asOf}
      id={id}
      className={className}
    />
  );
}

/** The `start` line's `source` ("open-rmf"); null for the Night Shift agent's own logs, which carry none. */
export function sourceOf(lines: readonly RunLine[]): string | null {
  const start = lines.find((line) => line.type === "start");
  return start?.type === "start" && start.source && start.source !== "wybe-nightshift" ? start.source : null;
}

/** The honest lines from the run log (conduct.ts): master-key entries, slips, moved signs, unfinished tasks. */
export type Conduct = {
  keys: MasterKeyEntries;
  slips: SlipCrossing[];
  signMoves: SignMove[];
  unfinished?: { ended: UnfinishedTask[]; open: UnfinishedTask[] };
};

export function RobotJudgementView({
  judgement,
  declines,
  basis,
  conduct,
  crossNight,
  source = null,
  asOf,
  id = "vurderinger",
  className,
}: {
  judgement: RobotJudgement;
  /** The refusals with the referee's verdict on each; without it the card counts them unsplit. */
  declines?: DeclineSplit;
  /** What each "done" rested on; without it the card shows the plain count. */
  basis?: DoneBasis;
  /** Master-key entries, slips and moved signs; left out when not given. */
  conduct?: Conduct;
  /** The same "done" figure over every live night in the ledger, behind "Slik vet vi det"; left out when not given. */
  crossNight?: CrossNight;
  /** Another producer than the Night Shift agent ("open-rmf"): no referee, no ledger, only what it sends. */
  source?: string | null;
  asOf?: string | null;
  id?: string;
  className?: string;
}) {
  const { strangers, done, declined, wetFloors, doNotDisturb } = judgement;
  const sourceName = source === "open-rmf" ? "Open-RMF-eksempelet (testdata)" : source;
  const headingId = `${id}-heading`;
  const slips = conduct?.slips ?? [];
  const wetMoves = (conduct?.signMoves ?? []).filter((move) => move.stillWet);
  return (
    <section id={id} aria-labelledby={headingId} className={cx("scroll-mt-6 rounded-lg border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-lg font-semibold tracking-[-0.01em]">
          Robotens vurderinger i natt
        </h2>
        <p className="text-sm text-muted">
          {sourceName ? `Fra ${sourceName}` : asOf ? `Fra robotens logg, fram til ${asOf.slice(0, 5)}` : "Fra robotens logg"}
        </p>
      </div>

      {strangers.refusals.length > 0 && <StrangerIncident strangers={strangers} />}

      <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 border-t border-line pt-4 md:grid-cols-2">
        <DoneRow basis={basis ?? unsplit(done)} />
        {declines ? (
          <DeclineRow declines={declines} />
        ) : (
          <Row icon="search" figure={String(declined.total)} label={declined.total === 1 ? "Melding avvist etter sjekk" : "Meldinger avvist etter sjekk"}>
            {declined.total === 0 ? "Ingen meldinger måtte avvises." : `${declineText(declined)}.`}
          </Row>
        )}
        {source && conduct?.unfinished && <UnfinishedRow unfinished={conduct.unfinished} />}
        {!source && (
          <>
            <Row icon="flag" figure={String(wetFloors.signed.length)} label="Skilt for vått gulv satt ut">
              {wetFloors.signed.length > 0 ? `${places(wetFloors.signed)}.` : wetFloors.found.length > 0 ? "Ingen skilt satt ut." : "Ingen våte gulv funnet."}
              {wetFloors.unsignedAtEnd.length > 0 && (
                <span className="mt-1 block">Vått uten skilt ved slutten: {places(wetFloors.unsignedAtEnd).toLowerCase()}.</span>
              )}
              {slips.map((slip, index) => (
                <span key={`slip-${index}`} className="mt-1 block">
                  {slipText(slip)}
                </span>
              ))}
              {wetMoves.map((move, index) => (
                <span key={`move-${index}`} className="mt-1 block">
                  Flyttet skiltet fra {place(move.from).toLowerCase()}
                  {move.clock ? ` kl. ${move.clock.slice(0, 5)}` : ""}
                  {move.to ? ` til ${place(move.to).toLowerCase()}` : ""} mens gulvet der fortsatt var vått.
                </span>
              ))}
            </Row>
            {conduct && <MasterKeyRow keys={conduct.keys} />}
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
          </>
        )}
      </ul>

      <HowWeKnow crossNight={crossNight} source={source} />
    </section>
  );
}

/** A plain count with no split (a caller without the log's basis): every "done" of unknown basis. */
function unsplit(done: RobotJudgement["done"]): DoneBasis {
  const zero = { reported: 0, confirmed: 0 };
  return { ...done, afterRise: zero, own: { ...zero, roomChecks: zero, spills: zero, other: zero }, unknown: done, evidence: { ...zero, signals: [] } };
}

/** "5 romsjekker og 4 søl". */
function ownParts(own: DoneBasis["own"]): string {
  const parts: string[] = [];
  if (own.roomChecks.reported) parts.push(`${own.roomChecks.reported} ${own.roomChecks.reported === 1 ? "romsjekk" : "romsjekker"}`);
  if (own.spills.reported) parts.push(`${own.spills.reported} søl`);
  if (own.other.reported) parts.push(`${own.other.reported} ${own.other.reported === 1 ? "annen oppgave" : "andre oppgaver"}`);
  return joinNo(parts);
}

/**
 * The night's "done", split by what it rested on. The figure is the part that carries over to a hotel with
 * no referee: what the robot said on its own judgement, and how much of it held.
 */
function DoneRow({ basis }: { basis: DoneBasis }) {
  const { reported, confirmed, own, afterRise, unknown } = basis;
  const realHotel = (
    <span className="mt-1 block">
      <span className="font-semibold text-text">I et ekte hotell</span> bekrefter låsloggen og robotens foto «ferdig». Ett signal alene står som «ikke
      bekreftet».
    </span>
  );
  if (reported === 0) {
    return (
      <Row icon="circle-check" figure="0" label="«Ferdig» meldt">
        Roboten har ikke meldt noe ferdig ennå.
        {realHotel}
      </Row>
    );
  }
  const missed = reported - confirmed;
  if (basis.evidence.reported > 0 && own.reported === 0 && afterRise.reported === 0) {
    const ev = basis.evidence;
    const short = ev.reported - ev.confirmed;
    return (
      <Row
        icon="circle-check"
        figure={
          <>
            {ev.confirmed} <span className="font-sans text-base font-normal">av</span> {ev.reported}
          </>
        }
        good={short === 0}
        label="«Ferdig» med to signaler"
      >
        {ev.confirmed > 0 && `${ev.confirmed} bekreftet av to uavhengige signaler (${joinNo(ev.signals.map(signalName))}). `}
        {short > 0 && `${short} har ikke to signaler og står som «ikke bekreftet».`}
        {realHotel}
      </Row>
    );
  }
  const total = (
    <>
      {confirmed} <span className="font-sans text-base font-normal">av</span> {reported}
    </>
  );
  if (own.reported === 0) {
    return (
      <Row icon="circle-check" figure={total} good={missed === 0} label="«Ferdig» bekreftet">
        {afterRise.reported > 0
          ? "Alle ble meldt etter at simulatoren hadde bekreftet arbeidet; ingen på robotens egen vurdering ennå."
          : "Hva hvert «ferdig» bygde på, står ikke i loggen."}
        {missed > 0 && ` ${missed} ble ikke bekreftet og telles ikke som fullført.`}
        {realHotel}
      </Row>
    );
  }
  const ownMissed = own.reported - own.confirmed;
  const rest: string[] = [];
  if (afterRise.reported > 0) rest.push(`${afterRise.reported === 1 ? "Den andre" : `De andre ${afterRise.reported}`} meldte den først etter at simulatoren hadde bekreftet arbeidet`);
  if (unknown.reported > 0) rest.push(`${unknown.reported} uten kjent grunnlag i loggen`);
  return (
    <Row
      icon="circle-check"
      figure={
        <>
          {own.confirmed} <span className="font-sans text-base font-normal">av</span> {own.reported}
        </>
      }
      good={ownMissed === 0}
      label="«Ferdig» på robotens egen vurdering"
    >
      {capitalise(ownParts(own))}: roboten meldte ferdig ut fra det den selv så
      {ownMissed === 0 ? (own.reported === 1 ? ", og det holdt." : `, og alle ${own.reported} holdt.`) : `; ${ownMissed} holdt ikke og telles ikke som fullført.`}
      {rest.length > 0 && ` ${rest.join("; ")} (${confirmed} av ${reported} bekreftet i alt).`}
      {realHotel}
    </Row>
  );
}

/** "Skled i korridor 2b kl. 23:51 og krysset det samme våte gulvet 27 ganger til uten å sette skilt der." */
function slipText(slip: SlipCrossing): string {
  const where = place(slip.place).toLowerCase();
  const when = slip.clock ? ` kl. ${slip.clock.slice(0, 5)}` : "";
  const n = slip.crossingsAfter;
  const times = `${n} ${n === 1 ? "gang" : "ganger"} til`;
  if (slip.signedAfter) return n > 0 ? `Skled i ${where}${when} og krysset det våte gulvet ${times} før skiltet kom.` : `Skled i ${where}${when} og satte skilt der etterpå.`;
  return n > 0 ? `Skled i ${where}${when} og krysset det samme våte gulvet ${times} uten å sette skilt der.` : `Skled i ${where}${when} og satte ikke skilt der.`;
}

/** The master-key entries without a knock first, by room, in the order the robot first opened each. */
function MasterKeyRow({ keys }: { keys: MasterKeyEntries }) {
  const { entries, withoutKnock } = keys;
  if (entries.length === 0) {
    return (
      <Row icon="key" label="Nøkkelkort">
        Roboten låste ikke opp noen rom med nøkkelkort.
      </Row>
    );
  }
  const counts = new Map<string, number>();
  for (const entry of entries) if (!entry.knocked) counts.set(entry.room, (counts.get(entry.room) ?? 0) + 1);
  const rooms = [...counts].map(([room, n]) => (n > 1 ? `${room} (${n})` : room));
  return (
    <Row
      icon="key"
      figure={
        <>
          {withoutKnock} <span className="font-sans text-base font-normal">av</span> {entries.length}
        </>
      }
      good={withoutKnock === 0}
      label="Innganger med nøkkelkort uten å banke på"
    >
      {withoutKnock === 0
        ? `Roboten banket på før alle ${entries.length} innganger med nøkkelkort.`
        : `Roboten låste seg inn ${entries.length} ${entries.length === 1 ? "gang" : "ganger"} og banket på først ${entries.length - withoutKnock} av dem. Uten banking: rom ${joinNo(rooms)}.`}
    </Row>
  );
}

/** "08.11 04:05" from an ISO time with its Oslo offset. */
function shortStamp(iso: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(iso);
  return match ? `${match[2]}.${match[1]} ${match[3]}` : iso;
}

/**
 * "Slik vet vi det": the referee, the rule behind "egen vurdering", the same figures over every live night
 * and the demo build's, and where they come from (commit hash, repo paths). Off the main read (the design juror).
 */
const SIGNAL_NAMES: Record<string, string> = {
  lock: "låslogg",
  photo: "foto",
  compartment: "skuffsensor",
  guest_ack: "gjestens bekreftelse",
  referee: "dommeren",
  sign_placed: "skilt satt ut",
  door_answered: "gjesten åpnet",
  item_placed: "plassert i rommet",
};

function signalName(signal: string): string {
  return SIGNAL_NAMES[signal] ?? signal;
}

/** The unfinished tasks of a producer without the Wybe request flow: failed or cancelled, and still open. */
function UnfinishedRow({ unfinished }: { unfinished: { ended: UnfinishedTask[]; open: UnfinishedTask[] } }) {
  const { ended, open } = unfinished;
  const total = ended.length + open.length;
  const describe = (task: UnfinishedTask) => `${task.request}${task.room ? ` (${place(task.room).toLowerCase()})` : ""}${task.note ? `: ${task.note}` : ""}`;
  return (
    <Row icon="clipboard" figure={String(total)} label={total === 1 ? "Oppgave ikke fullført" : "Oppgaver ikke fullført"}>
      {total === 0 ? "Alle oppgaver ble fullført." : ended.length > 0 ? `${ended.map(describe).join(" · ")}.` : null}
      {open.length > 0 && <span className="mt-1 block">Åpen ved slutten: {joinNo(open.map(describe))}.</span>}
    </Row>
  );
}

function HowWeKnow({ crossNight, source = null }: { crossNight?: CrossNight; source?: string | null }) {
  if (source) {
    return (
      <details className="group mt-5 border-t border-line pt-1 text-sm text-muted">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent-text hover:underline pointer-fine:min-h-8">
          Slik vet vi det
        </summary>
        <div className="flex max-w-[72ch] flex-col gap-1.5 pb-1">
          <p>
            Kilde: et testeksempel i Open-RMF-format (oppgavestatus og flåtestatus), skrevet av teamet, lest gjennom{" "}
            <span className="font-mono text-xs">src/features/nightshift/openRmf.ts</span> inn i samme loggformat som Wybe-natten (
            <span className="font-mono text-xs">docs/runlog.schema.json</span>).
          </p>
          <p>
            Her finnes ingen dommer. «Ferdig» teller som bekreftet bare med to ulike signaler fra oppgavens hendelser: dør åpnet (låsloggen), foto,
            skuffsensor eller gjestens PIN. Med ett signal står den som «ikke bekreftet».
          </p>
        </div>
      </details>
    );
  }
  const all = crossNight?.all;
  const build = crossNight?.build;
  const allOwn = crossNight?.allOwn;
  const buildOwn = crossNight?.buildOwn;
  return (
    <details className="group mt-5 border-t border-line pt-1 text-sm text-muted">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent-text hover:underline pointer-fine:min-h-8">
        Slik vet vi det
      </summary>
      <div className="flex max-w-[72ch] flex-col gap-1.5 pb-1">
        <p>
          «Bekreftet» og «godkjent» betyr at dommeren, Wybe Night Shift-simulatoren, svarte «Noted. Thanks.» på ferdigmeldingen, eller ga poeng for
          en avvisning. En slik dommer finnes ikke i et ekte hotell.
        </p>
        <p>
          «Egen vurdering»: poengsummen steg ikke mens roboten gjorde oppgaven, så den meldte ferdig uten å ha sett simulatorens bekreftelse. «Etter
          at simulatoren hadde bekreftet»: poengsummen steg før roboten meldte ferdig.
        </p>
        {all && (
          <p>
            Alle {all.nights} live-netter med logg: {grouped(all.credited)} av {grouped(all.reported)} godkjent ({percentText(all.percent)})
            {allOwn ? (
              <>
                ; på egen vurdering {grouped(allOwn.credited)} av {grouped(allOwn.reported)} ({percentText(allOwn.percent)}), romsjekker{" "}
                {grouped(allOwn.roomChecks.credited)} av {grouped(allOwn.roomChecks.reported)}.
              </>
            ) : (
              "."
            )}
            {build && build.nights > 1 && (
              <>
                {" "}
                Samme versjon som i natt (<span className="font-mono text-xs">{build.commit}</span>): {grouped(build.credited)} av {grouped(build.reported)}{" "}
                over {build.nights} netter{buildOwn ? `; på egen vurdering ${grouped(buildOwn.credited)} av ${grouped(buildOwn.reported)}` : ""}.
              </>
            )}
          </p>
        )}
        <p>
          Kilde: <span className="font-mono text-xs break-all">docs/runs/ledger.csv</span>
          {LEDGER_META.liveStarts !== null &&
            ` (${LEDGER_META.liveStarts} live-starter${LEDGER_META.latestStart ? `, siste ${shortStamp(LEDGER_META.latestStart)}` : ""})`}
          , regnet ut av <span className="font-mono text-xs">scripts/ledger.py</span> fra robotens logger. Nøkkelkort, våte gulv og skilt er talt fra
          nattens logg.
        </p>
      </div>
    </details>
  );
}

/**
 * The refusals in a manager's words, and as a decision for a person: a guest who said something never
 * came may still want it, so reception decides (Forespørsler), not the robot.
 */
function DeclineRow({ declines }: { declines: DeclineSplit }) {
  const notCredited = declines.checks.filter((check) => check.judged === "not_credited");
  const guests = declines.checks.filter((check) => check.kind === "noOrder").length;
  return (
    <Row
      icon="search"
      figure={
        declines.total > 0 ? (
          <>
            {declines.credited} <span className="font-sans text-base font-normal">av</span> {declines.total}
          </>
        ) : (
          "0"
        )
      }
      label={declines.total > 0 ? "Avvisninger som holdt" : "Avvisninger"}
    >
      {declines.total === 0 ? (
        "Roboten har ikke avvist noe."
      ) : (
        <>
          {declineSplitPlain(declines)}.
          {notCredited.length > 0 && (
            <span className="mt-1 block">
              Ikke godkjent: {joinNo(notCredited.map((check) => `${check.request} (${check.reason.replace(/\.$/, "").toLowerCase()})`))}.
            </span>
          )}
          {guests > 0 && (
            <span className="mt-1 block">
              {guests === 1 ? "Én gjest sa" : `${capitalise(countWord(guests))} gjester sa`} at noe aldri kom. Roboten fant ingen bestilling og leverte ikke. Gi det likevel? Det
              avgjør resepsjonen i{" "}
              <Link href="/foresporsler?filter=robot" className="font-semibold text-accent-text underline-offset-2 hover:underline">
                Forespørsler
              </Link>
              .
            </span>
          )}
        </>
      )}
    </Row>
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
