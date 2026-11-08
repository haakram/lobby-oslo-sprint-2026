"use client";

import Link from "next/link";
import { type ReactNode, useId, useMemo, useState } from "react";
import { placeName } from "@/features/replay";
import { cx, RegenIcon, type RegenName, Stat } from "@/ui";
import {
  type DoneBasis,
  doneBasis,
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
  type CrossNight,
  crossNightPrecision,
  DISTINCT_OWN,
  type DistinctClaims,
  grouped,
  intervalText,
  LEDGER_META,
  percentText,
  shiftOf,
  wilson,
} from "./ledger";
import type { RunLine } from "./runlog";

/**
 * "Robotens vurderinger i natt": the calls the robot made on its own, from its run log, in the
 * hotel's words. The refusals of the stranger come first, as one security incident with its times;
 * then every "done" split by what it rested on (jury round 4, the data juror and the Wybe juror): said on the robot's own
 * judgement (room checks, spills: no score rise during the task) or only after the simulator had
 * confirmed the work, with one line on what confirms "done" in a real hotel (the Holio juror); the refusals,
 * in a manager's words, handed to reception where a guest may still want the thing; the wet floors with
 * the slip and the moved sign; the master-key entries without a knock (the Wybe juror); the Do-Not-Disturb doors.
 * The referee, the simulator, the score-hidden runs, the cross-night figures from the evidence ledger, commit
 * hashes and repo paths sit behind "Slik vet vi det" (the design juror; round 5: never on the manager's main read).
 * Each own-judgement "done" is also checked against the robot's own log (round 5, the Wybe engineer): 209 reported
 * empty after the robot put bags inside it makes the demo night 8 of 9, not 9 of 9. Calm and factual: green only where the
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
        // "Vis alt" replaces the three figures with the full card; it never repeats them (the design juror, round 4).
        <button
          type="button"
          aria-expanded={open}
          aria-controls={fullId}
          onClick={() => setOpen((value) => !value)}
          className="mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent-text hover:underline pointer-fine:min-h-8"
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
                    {slipText(slip)}
                  </span>
                ))}
                {wetMoves.map((move, index) => (
                  <span key={`move-${index}`} className="mt-1 block">
                    Flyttet skiltet fra {inSentence(place(move.from))}
                    {move.clock ? ` kl. ${move.clock.slice(0, 5)}` : ""}
                    {move.to ? ` til ${inSentence(place(move.to))}` : ""} mens gulvet der fortsatt var vått.
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

/**
 * Overlevering's card (round 5, the creative juror and the Wybe engineer): three figures with plain labels and one short line
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
  const figures: { key: string; value: string | number; unit?: string; label: string; line: string | null; good?: boolean }[] = [];

  // 1. "Done": what holds against the robot's own log, or (another producer) what an outside signal confirmed.
  if (b.reported === 0) figures.push({ key: "done", value: 0, label: "«ferdig» meldt så langt", line: null });
  else if (b.own.reported > 0) {
    const own = ownAgainstLog(b, conduct?.contradictions ?? []);
    figures.push({
      key: "done",
      value: own.holds,
      unit: `av ${own.reported}`,
      label: "«ferdig» på egen vurdering holder mot robotens egen logg",
      line: own.contradicted.length > 0 ? own.contradicted.map(contradictionShort).join(" ") : `${capitalise(ownParts(b.own))}.`,
      good: own.holds === own.reported,
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
      good: ev.confirmed === ev.reported,
    });
  } else figures.push({ key: "done", value: b.confirmed, unit: `av ${b.reported}`, label: "«ferdig» bekreftet", line: null, good: b.confirmed === b.reported });

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
      good: conduct.keys.withoutKnock === 0,
    });
  }

  return (
    <>
      <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-line pt-4 sm:grid-cols-3">
        {figures.map((figure) => (
          <li key={figure.key} className="min-w-0">
            <Stat size="lg" value={figure.value} unit={figure.unit} label={figure.label} tone={figure.good ? "success" : "default"} />
            {figure.line && <p className="mt-1 text-xs text-muted">{figure.line}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-3 max-w-[80ch] text-sm text-muted">{REAL_HOTEL}</p>
    </>
  );
}

/** "Rom 209: bagasje satt inn 01:29, meldt tom 03:47." */
function contradictionShort(entry: SelfContradiction): string {
  const first = entry.placed[0];
  const what = first && LUGGAGE_ITEM.test(first.item) ? "bagasje" : "noe";
  return `Rom ${entry.room}: ${what} satt inn${first?.clock ? ` ${first.clock.slice(0, 5)}` : ""}, meldt tomt${entry.clock ? ` ${entry.clock.slice(0, 5)}` : ""}.`;
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
 * (round 5, the Wybe engineer: 209). The simulator and the score-hidden runs are behind "Slik vet vi det".
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
        good={ev.confirmed === ev.reported}
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
      <Row icon="circle-check" figure={total} good={missed === 0} label="«Ferdig» bekreftet">
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
      good={held.holds === held.reported}
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
    </Row>
  );
}

/** "Rom 209: roboten satte inn bagasje kl. 01:29, så rommet tomt kl. 03:47 og meldte det tomt (R-049). Kameraet og oppgaveloggen er uenige." */
function contradictionText(entry: SelfContradiction): string {
  const first = entry.placed[0];
  const what = first && LUGGAGE_ITEM.test(first.item) ? "bagasje" : "noe";
  return `Rom ${entry.room}: roboten satte inn ${what}${first?.clock ? ` kl. ${first.clock.slice(0, 5)}` : ""}, så rommet tomt${
    entry.clock ? ` kl. ${entry.clock.slice(0, 5)}` : ""
  } og meldte det tomt (${entry.request}). Kameraet og robotens egen oppgavelogg er uenige, så Fettero regner ikke den som holdt.`;
}

/** "Skled i korridor 2b kl. 23:51 og krysset det samme våte gulvet 27 ganger til uten å sette skilt der." */
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
  blind = blindChecks(),
}: {
  crossNight?: CrossNight;
  source?: string | null;
  basis?: DoneBasis;
  contradictions?: readonly SelfContradiction[];
  /** The final branch's distinct own-judgement claims (scripts/ledger.py); tests pass their own. */
  distinct?: DistinctClaims | null;
  /** The score-blind nights' own checks and how many said "not done". */
  blind?: { checks: number; saidNo: number } | null;
}) {
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
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-accent-text hover:underline pointer-fine:min-h-8">
        Slik vet vi det
      </summary>
      <div className="flex max-w-[72ch] flex-col gap-1.5 pb-1">
        <p>
          «Bekreftet utenfra» betyr her at dommeren, Wybe Night Shift-simulatoren, svarte «Noted. Thanks.» på ferdigmeldingen, eller ga poeng for en
          avvisning. En slik dommer finnes ikke i et ekte hotell.
        </p>
        <p>
          «Egen vurdering»: poengsummen steg ikke mens roboten gjorde oppgaven, så den meldte ferdig uten å ha sett simulatorens bekreftelse. «Holder mot
          egen logg»: ingen romsjekk ble meldt tom etter at roboten selv hadde satt noe inn i rommet samme natt.
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
        {distinct && distinct.claims > 0 && (
          <p>
            Talt som ulike påstander (samme natt og forespørsel spilt på nytt teller én gang), sluttgrenens {distinct.nights} netter: {distinct.credited} av{" "}
            {distinct.claims} på egen vurdering godkjent (95 %-intervall {intervalText(distinct.ci95, distinct.credited, distinct.claims)}; {grouped(distinct.reports)}{" "}
            meldinger med gjentakelsene).
          </p>
        )}
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
