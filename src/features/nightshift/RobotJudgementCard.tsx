"use client";

import Link from "next/link";
import { type ReactNode, useId, useMemo, useState } from "react";
import { placeName } from "@/features/replay";
import { Badge, cx, RegenIcon, type RegenName, Stat } from "@/ui";
import {
  type DoneBasis,
  doneBasis,
  type EndOfShift,
  endOfShift,
  type MasterKeyEntries,
  masterKeyEntries,
  ownAgainstLog,
  type SelfContradiction,
  selfContradictions,
  type SignMove,
  type SlipCrossing,
  signsMovedOffWet,
  slipCrossings,
  type UnfinishedTask,
  unfinishedTasks,
} from "./conduct";
import { type DeclineSplit, declineSplit, declineSplitPlain } from "./declines";
import { type RobotJudgement, robotJudgement } from "./judgement";
import {
  blindChecks,
  catchRate,
  type CrossNight,
  crossNightPrecision,
  DISTINCT_OWN,
  type DistinctClaims,
  FAULT_BED,
  FORECAST,
  grouped,
  HOTEL_RULES,
  intervalText,
  LEDGER_META,
  meanScore,
  missesByType,
  percentText,
  REHEARSAL,
  type Rehearsal,
  ROOM_CHECKS_FINAL,
  type RoomChecks,
  SLEEPING_GUEST,
  shareText,
  shiftOf,
  wilson,
} from "./ledger";
import type { RunLine } from "./runlog";

/**
 * "Robotens vurderinger i natt": the calls the robot made on its own, from its run log, in the
 * hotel's words. The refusals of the stranger come first, as one security incident with its times;
 * then every "done" split by what it rested on (jury round 4, data and domain reviews): said on the robot's own
 * judgement (room checks, spills: no score rise during the task) or only after the simulator had
 * confirmed the work, with one line on what confirms "done" in a real hotel (domain review); the refusals,
 * in a manager's words, handed to reception where a guest may still want the thing; the wet floors with
 * the slip and the moved sign; the master-key entries without a knock (domain review); the Do-Not-Disturb doors.
 * The referee, the simulator, the score-hidden runs, the cross-night figures from the evidence ledger, commit
 * hashes and repo paths sit behind "Slik vet vi det" (design review; round 5: never on the manager's main read).
 * Each own-judgement "done" is also checked against the robot's own log (round 5, domain review): 209 reported
 * empty after the robot put bags inside it makes the demo night 8 of 9, not 9 of 9. Calm and factual (round 6): the
 * robot's faults are amber with the words "Robotens feil" (they are what the manager acts on), its wins in ink, never
 * green; no red.
 *
 * Natteskift passes `until` (the replay's sim second) so the card follows the scrubber; Overlevering
 * shows the whole night.
 */
export function RobotJudgementCard({
  lines,
  until,
  asOf,
  id = "vurderinger",
  compact = false,
  className,
}: {
  lines: readonly RunLine[];
  /** Sim seconds since 22:00; the card counts only what happened by then. */
  until?: number;
  /** "03:12": shown as "fram til 03:12" while the night is not over. */
  asOf?: string | null;
  id?: string;
  /** Overlevering: the headline facts in three lines, everything else behind "Vis alt" (owner A, round 4). */
  compact?: boolean;
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
      contradictions: selfContradictions(lines, until),
      end: endOfShift(lines, until),
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
      compact={compact}
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
  /** Own room checks the robot's own log disputes (209); none when not given. */
  contradictions?: SelfContradiction[];
  /** Where the robot ended the shift, once the log has ended; left out when not given. */
  end?: EndOfShift | null;
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
  compact = false,
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
  /** The headline facts in three lines; the full card behind "Vis alt". */
  compact?: boolean;
  className?: string;
}) {
  const { strangers, done, declined, wetFloors, doNotDisturb } = judgement;
  const sourceName = source === "open-rmf" ? "Open-RMF-eksempelet (testdata)" : source;
  const headingId = `${id}-heading`;
  const fullId = useId();
  const [open, setOpen] = useState(false);
  const slips = conduct?.slips ?? [];
  const wetMoves = (conduct?.signMoves ?? []).filter((move) => move.stillWet);
  const showFull = !compact || open;
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

      {compact && !open && <CompactFigures judgement={judgement} declines={declines} basis={basis} conduct={conduct} source={source} />}

      {compact && (
        // "Vis alt" replaces the three figures with the full card; it never repeats them (design review, round 4).
        <button
          type="button"
          aria-expanded={open}
          aria-controls={fullId}
          onClick={() => setOpen((value) => !value)}
          // Quiet, not orange: on Overlevering the money step is the page's one orange action (round 5, owner A, design review).
          className="mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted underline underline-offset-4 hover:text-text pointer-fine:min-h-8"
        >
          {open ? "Vis mindre" : "Vis alt og slik vet vi det"}
        </button>
      )}

      {showFull && (
      <div id={fullId}>
        {strangers.refusals.length > 0 && <StrangerIncident strangers={strangers} />}

        <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 border-t border-line pt-4 md:grid-cols-2">
          <DoneRow basis={basis ?? unsplit(done)} contradictions={conduct?.contradictions ?? []} />
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
                  <span className="mt-1 block">Vått uten skilt ved slutten: {inSentence(places(wetFloors.unsignedAtEnd))}.</span>
                )}
                {slips.map((slip, index) => (
                  <span key={`slip-${index}`} className="mt-1 block">
                    <FaultWord />
                    {slipText(slip)}
                  </span>
                ))}
                {wetMoves.map((move, index) => (
                  <span key={`move-${index}`} className="mt-1 block">
                    <FaultWord />
                    Flyttet skiltet fra {inSentence(place(move.from))}
                    {move.clock ? ` kl. ${move.clock.slice(0, 5)}` : ""}
                    {move.to ? ` til ${inSentence(place(move.to))}` : ""} mens gulvet der fortsatt var vått.
                  </span>
                ))}
              </Row>
              {conduct && <MasterKeyRow keys={conduct.keys} />}
              {conduct?.end && <EndRow end={conduct.end} />}
              <Row
                icon="moon"
                figure={doNotDisturb.rooms.length > 0 ? String(doNotDisturb.entered.length) : undefined}
                fault={doNotDisturb.entered.length > 0}
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

        <HowWeKnow crossNight={crossNight} source={source} basis={basis} contradictions={conduct?.contradictions ?? []} />
      </div>
      )}
    </section>
  );
}

/** The real-hotel rule, said once under the figures and once in the full card (round 5: the evidence rule in conduct.ts). */
const REAL_HOTEL = (
  <>
    <span className="font-semibold text-text">I et ekte hotell</span> er «ferdig» bekreftet først når minst ett signal kommer utenfra roboten: låsloggen,
    gjesten, personalet eller PMS-en. To signaler fra roboten selv er robotens egen observasjon.
  </>
);

/** "79 %": a catch rate in whole per cent (the figure is an estimate; a decimal would claim more than it holds). */
const wholePercent = (share: number) => `${Math.round(share * 100)} %`;

/**
 * The fault bed in one plain line (round 6, the data review): the catch rate first (of the failures put in on purpose
 * and not repaired, the share the robot's check refused to call "done"), with and without the sleeping guest it cannot
 * see, then the precision at the lowest rate. Only on the full card; the rest is behind "Slik vet vi det".
 */
function faultLine(): string | null {
  const rates = FAULT_BED.rates;
  const types = FAULT_BED.types ?? [];
  if (rates.length === 0) return null;
  const low = rates[0];
  const caught = catchRate(types, { rate: low.rate });
  const awake = catchRate(types, { rate: low.rate, without: [SLEEPING_GUEST] });
  const precision = `Når den sa «ferdig», holdt ${shareText(low.blind.precision)} ved ${Math.round(low.rate * 100)} % feil.`;
  if (!caught) return `Feiltest uten nett: ${precision}`;
  return `Feiltest uten nett: robotens sjekk fanget ${wholePercent(caught.share)} av feilene vi la inn${
    awake ? ` (${wholePercent(awake.share)} uten gjesten som sover i et «sjekket» rom)` : ""
  }. ${precision}`;
}

/**
 * Overlevering's card (round 5, marketing and domain reviews): three figures with plain labels and one short line
 * each, then the real-hotel rule. The same selectors as the full card, so the two never disagree; no
 * simulator, referee or score-hidden figure here (those are behind "Slik vet vi det").
 */
function CompactFigures({
  judgement,
  declines,
  basis,
  conduct,
  source,
}: {
  judgement: RobotJudgement;
  declines?: DeclineSplit;
  basis?: DoneBasis;
  conduct?: Conduct;
  source: string | null;
}) {
  const b = basis ?? unsplit(judgement.done);
  const { strangers } = judgement;
  // `fault`: the robot's own fault, amber with its word; a win stays ink (round 6).
  const figures: { key: string; value: string | number; unit?: string; label: string; line: string | null; fault?: boolean }[] = [];

  // 1. "Done": what holds against the robot's own log, or (another producer) what an outside signal confirmed.
  if (b.reported === 0) figures.push({ key: "done", value: 0, label: "«ferdig» meldt så langt", line: null });
  else if (b.own.reported > 0) {
    const own = ownAgainstLog(b, conduct?.contradictions ?? []);
    figures.push({
      key: "done",
      value: own.holds,
      unit: `av ${own.reported}`,
      label: "«ferdig» på egen vurdering holder mot robotens egen logg",
      line:
        own.contradicted.length > 0
          ? `${own.contradicted.length} tatt: ${own.contradicted.map(contradictionShort).join("; ")}.`
          : own.holds < own.reported
            ? `${own.reported - own.holds} holdt ikke.`
            : `${capitalise(ownParts(b.own))}.`,
      fault: own.holds < own.reported,
    });
  } else if (b.evidence.reported > 0) {
    const ev = b.evidence;
    const single = ev.reported - ev.confirmed - ev.robotOnly;
    figures.push({
      key: "done",
      value: ev.confirmed,
      unit: `av ${ev.reported}`,
      label: "«ferdig» bekreftet med et signal utenfra roboten",
      line: [ev.robotOnly > 0 ? `${ev.robotOnly} robotens egen observasjon` : null, single > 0 ? `${single} ikke bekreftet` : null].filter(Boolean).join(" · ") || null,
    });
  } else figures.push({ key: "done", value: b.confirmed, unit: `av ${b.reported}`, label: "«ferdig» bekreftet", line: null, fault: b.confirmed < b.reported });

  // 2. The stranger, or what the robot refused, or (another producer) what is not finished.
  if (strangers.refusals.length > 0) {
    const times = strangers.refusals.map((refusal) => refusal.clock.slice(0, 5));
    const waits = [...new Set(strangers.keycardWaits)].map((room) => room.replace(/^room-/, ""));
    figures.push({
      key: "stranger",
      value: strangers.refusals.length,
      label: `${strangers.refusals.length === 1 ? "gang" : "ganger"} sa nei til en ukjent person`,
      line: `${times.length > 1 ? `${times[0]}–${times.at(-1)}, ${strangers.rooms.length} rom` : `Kl. ${times[0]}`}${waits.length > 0 ? ` · holdt nøkkelkortet ved ${joinNo(waits)}` : ""}.`,
    });
  } else if (source && conduct?.unfinished) {
    const { ended, open } = conduct.unfinished;
    figures.push({ key: "unfinished", value: ended.length + open.length, label: "oppgaver ikke fullført", line: open.length > 0 ? `${open.length} åpen ved slutten.` : null });
  } else if (declines && declines.total > 0) {
    figures.push({ key: "declines", value: declines.credited, unit: `av ${declines.total}`, label: "avvisninger som holdt", line: `${capitalise(declineSplitPlain(declines))}.` });
  }

  // 3. Doors: master-key entries without a knock, with the slip on the line under it.
  if (!source && conduct && conduct.keys.entries.length > 0) {
    const slip = conduct.slips[0];
    figures.push({
      key: "keys",
      value: conduct.keys.withoutKnock,
      unit: `av ${conduct.keys.entries.length}`,
      label: "nøkkelkortinnganger uten å banke på",
      line: slip ? `Også: ${slipShort(slip)}` : null,
      fault: conduct.keys.withoutKnock > 0 || Boolean(slip),
    });
  }

  return (
    <>
      <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-line pt-4 sm:grid-cols-3">
        {figures.map((figure) => (
          <li key={figure.key} className="min-w-0">
            <Stat size="lg" value={figure.value} unit={figure.unit} label={figure.label} tone={figure.fault ? "warning" : "default"} />
            {(figure.line || figure.fault) && (
              <p className="mt-1 text-sm text-muted">
                {figure.fault && <FaultWord />}
                {figure.line}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 max-w-[80ch] text-sm text-muted">{REAL_HOTEL}</p>
    </>
  );
}

/** "Robotens feil." in amber: the word that goes with the colour (DESIGN.md: amber always says its state). */
function FaultWord() {
  return <span className="mr-1 font-semibold text-warning">Robotens feil.</span>;
}

/** "rom 209, bagasje inn 01:29, meldt tomt 03:47": the two times that disagree, for the compact card's "1 tatt:" line. */
function contradictionShort(entry: SelfContradiction): string {
  const first = entry.placed[0];
  const what = first && LUGGAGE_ITEM.test(first.item) ? "bagasje" : "noe";
  return `rom ${entry.room}, ${what} inn${first?.clock ? ` ${first.clock.slice(0, 5)}` : ""}, meldt tomt${entry.clock ? ` ${entry.clock.slice(0, 5)}` : ""}`;
}

const LUGGAGE_ITEM = /^luggage(?:-|$)/;

/** "skled i korridor 2B 23:51, krysset 27 ganger til uten skilt." */
function slipShort(slip: SlipCrossing): string {
  const n = slip.crossingsAfter;
  const when = slip.clock ? ` ${slip.clock.slice(0, 5)}` : "";
  const after = n > 0 ? `, krysset ${n} ${n === 1 ? "gang" : "ganger"} til${slip.signedAfter ? " før skiltet kom" : " uten skilt"}` : slip.signedAfter ? ", skilt satt ut etterpå" : ", ikke skiltet";
  return `skled i ${inSentence(place(slip.place))}${when}${after}.`;
}

/** A plain count with no split (a caller without the log's basis): every "done" of unknown basis. */
function unsplit(done: RobotJudgement["done"]): DoneBasis {
  const zero = { reported: 0, confirmed: 0 };
  return { ...done, afterRise: zero, own: { ...zero, roomChecks: zero, spills: zero, other: zero, confirmedRequests: [] }, unknown: done, evidence: { ...zero, robotOnly: 0, signals: [] } };
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
 * no referee: what the robot said on its own judgement, and how much of it holds against its own log
 * (round 5, domain review: 209). The simulator and the score-hidden runs are behind "Slik vet vi det".
 */
function DoneRow({ basis, contradictions = [] }: { basis: DoneBasis; contradictions?: readonly SelfContradiction[] }) {
  const { reported, confirmed, own, afterRise, unknown } = basis;
  const realHotel = <span className="mt-1 block">{REAL_HOTEL}</span>;
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
    const single = ev.reported - ev.confirmed - ev.robotOnly;
    return (
      <Row
        icon="circle-check"
        figure={
          <>
            {ev.confirmed} <span className="font-sans text-base font-normal">av</span> {ev.reported}
          </>
        }
        label="«Ferdig» bekreftet"
      >
        {ev.confirmed > 0 && `${ev.confirmed} med et signal utenfra roboten (${joinNo(ev.signals.map(signalName))}). `}
        {ev.robotOnly > 0 && `${ev.robotOnly} er robotens egen observasjon: to signaler, begge fra roboten. `}
        {single > 0 && `${single} har bare ett signal og står som «ikke bekreftet».`}
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
      <Row icon="circle-check" figure={total} fault={missed > 0} label="«Ferdig» bekreftet">
        {afterRise.reported > 0 ? "Alle ble meldt etter at arbeidet var bekreftet utenfra; ingen på robotens egen vurdering ennå." : "Hva hvert «ferdig» bygde på, står ikke i loggen."}
        {missed > 0 && ` ${missed} ble ikke bekreftet og telles ikke som fullført.`}
        {realHotel}
      </Row>
    );
  }
  const held = ownAgainstLog(basis, contradictions);
  const ownMissed = own.reported - own.confirmed;
  const rest: string[] = [];
  if (afterRise.reported > 0) rest.push(`${afterRise.reported === 1 ? "Den andre" : `De andre ${afterRise.reported}`} ble meldt etter at arbeidet var bekreftet utenfra`);
  if (unknown.reported > 0) rest.push(`${unknown.reported} uten kjent grunnlag i loggen`);
  return (
    <Row
      icon="circle-check"
      figure={
        <>
          {held.holds} <span className="font-sans text-base font-normal">av</span> {held.reported}
        </>
      }
      fault={held.holds < held.reported}
      label="«Ferdig» på egen vurdering som holder mot robotens egen logg"
    >
      {capitalise(ownParts(own))}: roboten meldte ferdig ut fra det den selv så
      {ownMissed === 0 && held.contradicted.length === 0
        ? own.reported === 1
          ? ", og det holdt."
          : `, og alle ${own.reported} holdt.`
        : ownMissed > 0
          ? `; ${ownMissed} holdt ikke og telles ikke som fullført.`
          : "."}
      {held.contradicted.map((entry) => (
        <span key={entry.request} className="mt-1 block">
          {contradictionText(entry)}
        </span>
      ))}
      {rest.length > 0 && <span className="mt-1 block">{`${rest.join("; ")} (${confirmed} av ${reported} i alt).`}</span>}
      {realHotel}
      {faultLine() && <span className="mt-1 block">{faultLine()}</span>}
    </Row>
  );
}

/**
 * "Rom 209: roboten satte inn bagasje kl. 01:29, så rommet tomt kl. 03:47 og meldte det tomt (R-049). Robotens blikk og
 * dens egen oppgavelogg er uenige." Robotens blikk, not a camera: the simulator answers a look in text (round 6).
 */
function contradictionText(entry: SelfContradiction): string {
  const first = entry.placed[0];
  const what = first && LUGGAGE_ITEM.test(first.item) ? "bagasje" : "noe";
  return `Rom ${entry.room}: roboten satte inn ${what}${first?.clock ? ` kl. ${first.clock.slice(0, 5)}` : ""}, så rommet tomt${
    entry.clock ? ` kl. ${entry.clock.slice(0, 5)}` : ""
  } og meldte det tomt (${entry.request}). Robotens blikk og dens egen oppgavelogg er uenige, så Fettero regner den ikke som holdt.`;
}

/** "Skled i korridor 2B kl. 23:51 og krysset det samme våte gulvet 27 ganger til uten å sette skilt der." */
function slipText(slip: SlipCrossing): string {
  const where = inSentence(place(slip.place));
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
      fault={withoutKnock > 0}
      label="Innganger med nøkkelkort uten å banke på"
    >
      {withoutKnock === 0
        ? `Roboten banket på før alle ${entries.length} innganger med nøkkelkort.`
        : `Roboten låste seg inn ${entries.length} ${entries.length === 1 ? "gang" : "ganger"} og banket på først ${entries.length - withoutKnock} av dem. Uten banking: rom ${joinNo(rooms)}.`}
    </Row>
  );
}

/**
 * Where the robot ended the shift (round 6): docked or not, its battery, and the master keycard. A robot left in a
 * corridor, or still holding the master key, is the robot's fault a hotel acts on at 06:00.
 */
function EndRow({ end }: { end: EndOfShift }) {
  const where = end.place ? inSentence(place(end.place)) : "ukjent sted";
  const battery = end.battery !== null ? `, ${Math.round(end.battery)} % batteri` : "";
  return (
    <Row icon={end.docked ? "plug" : "battery-low"} label="Ved skiftslutt" fault={!end.docked || end.keycard}>
      {end.docked ? `På lader ved ${where}${battery}.` : `Står ved ${where}, ikke på lader${battery}.`}
      {end.keycard && <span className="mt-1 block">Har fortsatt hovednøkkelkortet. I et hotell leveres det tilbake før vakten slutter.</span>}
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
 * and the demo build's, and where they come from (commit hash, repo paths). Off the main read (design review).
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
  const describe = (task: UnfinishedTask) => `${task.request}${task.room ? ` (${inSentence(place(task.room))})` : ""}${task.note ? `: ${task.note}` : ""}`;
  return (
    <Row icon="clipboard" figure={String(total)} label={total === 1 ? "Oppgave ikke fullført" : "Oppgaver ikke fullført"}>
      {total === 0 ? "Alle oppgaver ble fullført." : ended.length > 0 ? `${ended.map(describe).join(" · ")}.` : null}
      {open.length > 0 && <span className="mt-1 block">Åpen ved slutten: {joinNo(open.map(describe))}.</span>}
    </Row>
  );
}

function HowWeKnow({
  crossNight,
  source = null,
  basis,
  contradictions = [],
  distinct = DISTINCT_OWN,
  finalRoomChecks = ROOM_CHECKS_FINAL,
  rehearsal = REHEARSAL,
  blind = blindChecks(),
}: {
  crossNight?: CrossNight;
  source?: string | null;
  basis?: DoneBasis;
  contradictions?: readonly SelfContradiction[];
  /** The final branch's distinct own-judgement claims (scripts/ledger.py); tests pass their own. */
  distinct?: DistinctClaims | null;
  /** The final branch's room checks against the robot's own log, and the dress rehearsal's (scripts/ledger.py, round 6). */
  finalRoomChecks?: RoomChecks | null;
  rehearsal?: Rehearsal | null;
  /** The score-blind nights' own checks and how many said "not done". */
  blind?: { checks: number; saidNo: number } | null;
}) {
  if (source) {
    return (
      <details className="group mt-5 border-t border-line pt-1 text-sm text-muted">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-muted underline underline-offset-4 hover:text-text pointer-fine:min-h-8">
          Slik vet vi det
        </summary>
        <div className="flex max-w-[72ch] flex-col gap-1.5 pb-1">
          <p>
            Kilde: et testeksempel i Open-RMF-format (oppgavestatus og flåtestatus), skrevet av teamet, lest gjennom{" "}
            <span className="font-mono text-xs">src/features/nightshift/openRmf.ts</span> inn i samme loggformat som Wybe-natten (
            <span className="font-mono text-xs">docs/runlog.schema.json</span>).
          </p>
          <p>
            Her finnes ingen dommer. «Ferdig» teller som bekreftet bare med to ulike signaler, og minst ett av dem må komme utenfra roboten: gjestens PIN,
            låsloggen med gjestens eget kort, personalet eller PMS-en. Robotens kamera, skuffsensor og en dør den åpnet med sitt eget kort er robotens egne
            signaler: to av dem står som «robotens egen observasjon», ett alene som «ikke bekreftet».
          </p>
        </div>
      </details>
    );
  }
  const all = crossNight?.all;
  const allOwn = crossNight?.allOwn;
  const hidden = crossNight?.blind;
  const own = basis?.own;
  const night = own && own.reported > 0 ? { ...own, ci: wilson(own.confirmed, own.reported) } : null;
  const disputed = basis ? ownAgainstLog(basis, contradictions).contradicted : [];
  return (
    <details className="group mt-5 border-t border-line pt-1 text-sm text-muted">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-muted underline underline-offset-4 hover:text-text pointer-fine:min-h-8">
        Slik vet vi det
      </summary>
      <div className="flex max-w-[72ch] flex-col gap-1.5 pb-1">
        <p>
          «Bekreftet utenfra» og «godkjent» betyr her at Wybe Night Shift-simulatoren svarte «Noted. Thanks.» på ferdigmeldingen, eller ga poeng for
          en avvisning. En slik dommer finnes ikke i et ekte hotell.
        </p>
        <p>
          «Egen vurdering»: poengsummen steg ikke mens roboten gjorde oppgaven, så den meldte ferdig uten å ha sett simulatorens bekreftelse. «Holder mot
          egen logg»: ingen romsjekk ble meldt tom etter at roboten selv hadde satt noe inn i rommet samme natt. «Robotens blikk» er simulatorens
          tekstsvar når roboten ser seg om: simulatoren har ikke kamera.
        </p>
        {night && (
          <p>
            I natt godkjente simulatoren {night.confirmed} av {night.reported} på egen vurdering (få tilfeller: 95 %-intervall{" "}
            {intervalText(night.ci, night.confirmed, night.reported)})
            {disputed.length > 0
              ? `; ${disputed.length === 1 ? "én" : disputed.length} av dem motsies av robotens egen logg (${joinNo(disputed.map((entry) => `rom ${entry.room}`))}).`
              : "."}
          </p>
        )}
        {distinct && distinct.claims > 0 && <OwnLogAcrossNights distinct={distinct} roomChecks={finalRoomChecks} />}
        {rehearsal && <RehearsalAgainstLog rehearsal={rehearsal} />}
        {FORECAST.first && FORECAST.second && <Forecasts />}
        {hidden && (
          <p>
            Med poengsummen skjult ({hidden.nights} live-netter der agenten aldri leste poengsummen eller svaret når den avgjorde «ferdig»: score-blind,{" "}
            <span className="font-mono text-xs">kind=experiment</span> i ledger.csv) tok roboten {grouped(hidden.reported)} «ferdig»-avgjørelser, og{" "}
            {grouped(hidden.credited)} ble godkjent.{" "}
            {blind && blind.checks > 0
              ? blind.saidNo === 0
                ? `Robotens egen sjekk sa aldri nei på disse nettene (0 av ${grouped(blind.checks)} sjekker): det viser at poengsummen ikke trengtes der, ikke hvor godt roboten oppdager en feil.`
                : `Robotens egen sjekk sa nei ${blind.saidNo} av ${grouped(blind.checks)} ganger.`
              : null}
          </p>
        )}
        {FAULT_BED.rates.length > 0 && <FaultBed />}
        {HOTEL_RULES.scores.length > 0 && <HotelRules />}
        {all && (
          <p>
            Alle {all.nights} live-netter med logg, gjentakelser av samme seed medregnet: {grouped(all.credited)} av {grouped(all.reported)} godkjent (
            {percentText(all.percent)})
            {allOwn ? (
              <>
                ; på egen vurdering {grouped(allOwn.credited)} av {grouped(allOwn.reported)} ({percentText(allOwn.percent)}), romsjekker{" "}
                {grouped(allOwn.roomChecks.credited)} av {grouped(allOwn.roomChecks.reported)}.
              </>
            ) : (
              "."
            )}
          </p>
        )}
        <p>
          Kilde: <span className="font-mono text-xs break-all">docs/runs/ledger.csv</span>
          {LEDGER_META.liveStarts !== null &&
            ` (${LEDGER_META.liveStarts} live-starter${LEDGER_META.latestStart ? `, siste ${shortStamp(LEDGER_META.latestStart)}` : ""})`}
          , regnet ut av <span className="font-mono text-xs">scripts/ledger.py</span> fra robotens logger. Nøkkelkort, våte gulv, skilt og 209 er talt fra
          nattens logg.
        </p>
      </div>
    </details>
  );
}

/**
 * Both figures for the final branch (round 6, the data and domain reviews): credited by the simulator, and holding
 * against the robot's own log, counted once per (seed, request), each with its Wilson interval; then why they differ.
 */
function OwnLogAcrossNights({ distinct, roomChecks }: { distinct: DistinctClaims; roomChecks: RoomChecks | null }) {
  const holds = distinct.holds_log;
  return (
    <p>
      Sluttgrenens {distinct.nights} netter, talt som ulike påstander (samme seed og forespørsel spilt på nytt teller én gang): {distinct.credited} av{" "}
      {distinct.claims} på egen vurdering godkjent av simulatoren (95 %-intervall {intervalText(distinct.ci95, distinct.credited, distinct.claims)})
      {holds !== undefined && distinct.ci95_log ? (
        <>
          , men <span className="font-semibold text-text">{holds} av {distinct.claims} holder mot robotens egen logg</span> (95 %-intervall{" "}
          {intervalText(distinct.ci95_log, holds, distinct.claims)})
        </>
      ) : null}
      ; {grouped(distinct.reports)} meldinger med gjentakelsene.
      {roomChecks && roomChecks.distinct_contradicted > 0 && (
        <>
          {" "}
          {roomChecks.distinct_contradicted} av {roomChecks.distinct} romsjekker ble meldt tomme i et rom roboten selv hadde satt bagasje inn i, og simulatoren
          godkjente {roomChecks.contradicted_credited === roomChecks.contradicted ? "alle" : `${roomChecks.contradicted_credited} av ${roomChecks.contradicted}`}: den
          fjerner levert bagasje fra rommet, så dens romsjekk ser den ikke.
        </>
      )}
    </p>
  );
}

/** The dress rehearsal by the same rule: the build that plays the final, on ten seeds no build had played (round 6). */
function RehearsalAgainstLog({ rehearsal }: { rehearsal: Rehearsal }) {
  const r = rehearsal;
  const rc = r.room_checks;
  return (
    <p>
      Generalprøven (bygget som spiller finalen, <span className="font-mono text-xs">{r.build}</span>, {r.nights} netter på seeds ingen bygg hadde spilt):{" "}
      {r.own_credited} av {r.own} på egen vurdering godkjent av simulatoren, {r.own_holds_log} av {r.own} holder mot egen logg (95 %-intervall{" "}
      {intervalText(r.ci95_log, r.own_holds_log, r.own)}). {rc.contradicted} av {rc.reports} romsjekker motsagt, på {rc.nights_firing} av {rc.nights} netter
      {rc.contradicted > 0
        ? `, og simulatoren godkjente ${rc.contradicted_credited === rc.contradicted ? `alle ${rc.contradicted}` : `${rc.contradicted_credited} av dem`}.`
        : "."}
    </p>
  );
}

/** The two forecasts committed before the final, and the final's slot (scripts/forecast.py, round 6). */
function Forecasts() {
  const { first, second, final } = FORECAST;
  const band = (b: NonNullable<typeof first>) => `${grouped(b.median)} (80 %: ${grouped(b.low)}–${grouped(b.high)})`;
  return (
    <p>
      Prognose for finalen (snitt av de 9 beste av 10 netter), begge låst før kl. 12: modellen {band(first!)}, generalprøven alene {band(second!)}. Finalen:{" "}
      {final ? `${grouped(Math.round(final.score))} (${final.source}).` : "fylles inn etter kl. 13:05."} Kilde:{" "}
      <span className="font-mono text-xs">docs/runs/forecast.txt</span>.
    </p>
  );
}

/** "gjest som sover i et «sjekket» rom": the fault types the check misses, in the hotel's words. */
const FAULT_NAMES: Record<string, string> = {
  "room.occupied": "en gjest som sover i et «sjekket» rom",
  "say.polite_off_topic": "et høflig svar som ikke handler om saken",
  "noise.restarts": "musikk som starter igjen",
  "lost.lookalike": "en hittegjenstand som ligner",
  "noise.refuses": "en gjest som nekter å skru ned",
  "noise.no_answer": "ingen svar på døren ved bråk",
  "say.no_answer": "ingen svar på en melding",
  "say.off_topic": "et svar om noe annet",
  "place.wrong_room": "levert til feil rom",
};

/** The catch rate per rate, with and without the sleeping guest, and the types it misses most, from the per-type table. */
function FaultCatch() {
  const types = FAULT_BED.types ?? [];
  const rates = FAULT_BED.rates;
  const all = rates.map((rate) => catchRate(types, { rate: rate.rate }));
  const awake = rates.map((rate) => catchRate(types, { rate: rate.rate, without: [SLEEPING_GUEST] }));
  if (all.some((entry) => entry === null)) return null;
  const at = rates.map((rate) => `${Math.round(rate.rate * 100)}`).join(" / ");
  const misses = missesByType(types)
    .filter((entry) => entry.missed / entry.hit >= 0.25)
    .map((entry) => `${FAULT_NAMES[entry.type] ?? entry.type} (${grouped(entry.missed)} av ${grouped(entry.hit)})`);
  return (
    <>
      {" "}
      Av feilene roboten ikke rettet selv, fanget sjekken{" "}
      {all.map((entry) => `${grouped(entry!.caught)} av ${grouped(entry!.caught + entry!.missed)} (${wholePercent(entry!.share)})`).join(" / ")} ved {at} % feil;
      uten gjesten som sover {awake.map((entry) => (entry ? wholePercent(entry.share) : "–")).join(" / ")}. Den bommer på {joinNo(misses)}.
    </>
  );
}

/** The fault bed behind "Slik vet vi det": what was injected, the catch rate, precision and recall, where it misses, and the limit. */
function FaultBed() {
  const bed = FAULT_BED;
  const rates = bed.rates;
  const list = (pick: (rate: (typeof rates)[number]) => string) => rates.map(pick).join(" / ");
  const at = rates.map((rate) => `${Math.round(rate.rate * 100)}`).join(" / ");
  return (
    <p>
      Det måler feiltesten: uten nett, i {bed.realNights} gjenoppbygde ekte netter × {bed.draws} trekninger med {bed.faultTypes} slags innlagte feil (feil rom,
      utenfor døren, skilt ved siden av sølet, ingen svar, …), med og uten poengsummen på de samme feilene ({grouped(bed.nights)} netter,{" "}
      <span className="font-mono text-xs">{bed.branch}</span> <span className="font-mono text-xs">{bed.commit}</span>).
      <FaultCatch /> Uten poengsummen holdt {list((rate) => shareText(rate.blind.precision))} av
      «ferdig» ved {at} % feil, og sjekken fant {list((rate) => shareText(rate.blind.recall))} av det som virkelig var gjort (med poengsummen{" "}
      {rates.map((rate) => `${shareText(rate.sighted.precision)}/${shareText(rate.sighted.recall)}`).join(", ")}). Sjekken sa «ikke ferdig»{" "}
      {list((rate) => grouped(rate.saidNotDone))} ganger, mot {bed.saidNotDoneWithoutFaults === 1 ? "én gang" : `${bed.saidNotDoneWithoutFaults} ganger`} uten feil. På feil som
      synes i svaret den leser, holdt {list((rate) => shareText(rate.visible.precision))}, og den fanget {bed.visibleCaught}; med poengsummen ble{" "}
      {shareText(bed.sightedSignsFalseDone)} av skiltene satt ved siden av sølet falske «ferdig», og poengsummen bommer også på gjesten som sover. Presisjonen
      flytter seg med hvor ofte noe feiler, fangstraten gjør ikke det. Feilformuleringene er skrevet av oss: de viser hva slags svar som lurer sjekken, ikke
      hvor ofte det skjer. Fasiten er simulatorens, så feiltesten ser ikke bagasjen simulatoren fjerner (rom 209).
    </p>
  );
}

/**
 * What the hotel's rules cost, behind "Slik vet vi det" (round 5, domain reviews): the hotel-rules mode live
 * on four seeds against the final build's nights on the same seeds, the knocks counted from the logs, and the
 * replay bed's cost over 164 nights (data/hotel-rules.json, hamad/hotelrules).
 */
function HotelRules() {
  const rules = HOTEL_RULES;
  const scores = (list: readonly number[]) => list.map(grouped).join(" / ");
  const nb = (n: number) => n.toLocaleString("nb-NO");
  const mean = meanScore(rules.scores);
  const finalMean = meanScore(rules.finalScores);
  return (
    <p>
      Hotellregler: en egen modus (<span className="font-mono text-xs">{rules.flag}</span>, <span className="font-mono text-xs">{rules.branch}</span>{" "}
      <span className="font-mono text-xs">{rules.commit}</span>) banker på før hver inngang med nøkkelkort, flytter aldri et skilt fra et vått gulv, går utenom
      korridorer den vet er våte og setter skilt på et søl ingen har meldt når den har skledd. Live på seed {joinNo(rules.seeds.map(String))} (kl.{" "}
      {rules.measuredAt}): {scores(rules.scores)} mot finalebyggets {scores(rules.finalScores)} på de samme seedene, snitt {grouped(mean)} mot {grouped(finalMean)},{" "}
      {nb(mean - finalMean)} poeng natten. Den banket på før {rules.keycard.knockedFirst} av {rules.keycard.entries} innganger med nøkkelkort (finalebygget{" "}
      {rules.finalKeycard.knockedFirst} av {rules.finalKeycard.entries} de samme nettene). Gjenspilt på {rules.replay.nights} ekte netter koster reglene{" "}
      {nb(rules.replay.plain)} poeng natten; det meste er skiltene, for lageret har bare {rules.replay.signsInStore}.
    </p>
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
              <Link href="/foresporsler?filter=robot" className="font-semibold text-text underline underline-offset-2 hover:no-underline">
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
      <RegenIcon name="shield-check" size={24} className="mt-0.5 shrink-0 text-text" />
      <div className="min-w-0">
        <p className="text-sm text-muted">Sikkerhet · én hendelse</p>
        <p className="mt-0.5 text-base font-semibold sm:text-lg">
          Sa nei <span className="font-mono font-medium tabular-nums">{count}</span> {count === 1 ? "gang" : "ganger"} til en ukjent person
        </p>
        <p className="mt-1 max-w-[72ch] text-base text-muted">
          En mann i badekåpe ba roboten slippe ham inn i {roomsText} {span}. Roboten sa nei hver gang, ga ikke fra seg nøkkelkort og fulgte ikke etter.
          {keycardWaits.length > 0 &&
            ` ${keycardWaits.length === 1 ? "Én gang" : `${capitalise(countWord(keycardWaits.length))} ganger`} ventet den med å låse opp ${joinNo(
              [...new Set(keycardWaits)].map(place).map(inSentence),
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

/** One figure of the full card. `fault`: the robot's own fault, amber with the words "Robotens feil"; otherwise ink (round 6). */
function Row({ icon, figure, label, fault = false, children }: { icon: RegenName; figure?: ReactNode; label: string; fault?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <RegenIcon name={fault ? "alert-triangle" : icon} size={20} className={cx("mt-1 shrink-0", fault ? "text-warning" : "text-muted")} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          {figure !== undefined && <span className={cx("font-mono text-xl font-medium tabular-nums", fault ? "text-warning" : "text-text")}>{figure}</span>}
          <span className="font-semibold">{label}</span>
          {fault && <Badge tone="warning">Robotens feil</Badge>}
        </p>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
      </div>
    </li>
  );
}

/** "Korridor 2B", as the corridor signs read and as Overlevering writes it (round 5: one spelling everywhere). */
function place(id: string): string {
  return id.startsWith("corridor-") ? `Korridor ${id.slice(9).toUpperCase()}` : placeName(id);
}

/** A place name inside a sentence: "korridor 2B", "rom 209" (only the first letter goes down). */
function inSentence(name: string): string {
  return name.charAt(0).toLocaleLowerCase("nb-NO") + name.slice(1);
}

/** "Korridor 3D, 3A og 2A" for corridors; place names joined otherwise. */
function places(ids: readonly string[]): string {
  if (ids.length > 1 && ids.every((id) => id.startsWith("corridor-"))) return `Korridor ${joinNo(ids.map((id) => id.slice(9).toUpperCase()))}`;
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
