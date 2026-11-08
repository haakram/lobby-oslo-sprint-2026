import { canAccess } from "@/features/auth/roles";
import { moneyHeadline } from "@/features/rooms/money";
import { occupancy, revenueLastNight } from "@/features/rooms/pms";
import type { DashboardData } from "./data";
import { formatKroner } from "./format";
import { requestKindLabel } from "./labels";
import type { Night } from "./selectors";

/**
 * Oversikt's good news, read first (team lead 2026-11-08): the greeting, the line under it and the
 * hotel's figures, from the night and the day's data. What went wrong is not hidden: it is part of a
 * total ("71 av 81 fullført"), and what needs a person goes to the bell (src/features/notifications).
 */

export const ROOMS_IN_HOTEL = 36;

/**
 * What a person would have spent on each kind of task the robot finished, in minutes: an estimate
 * for the "Timer spart" figure, not a measurement. Walking there and back is the larger part.
 */
export const MINUTES_PER_TASK: Readonly<Record<string, number>> = {
  amenity: 10,
  tray: 12,
  room_check: 8,
  noise: 10,
  message: 6,
  bags: 12,
  lost_item: 15,
  spill: 15,
  followup: 6,
};
const MINUTES_OTHER = 8;
/** What a person spends picking up each request the robot hands back (reading it, walking there): taken off. */
export const MINUTES_PER_HANDBACK = 5;

export type TimeSaved = {
  /** Staff minutes the robot's credited tasks stood for, before the handbacks. */
  gross: number;
  /** Minutes people spend on what the robot handed back. */
  handback: number;
  /** gross − handback, never below 0: the figure on the screen. */
  net: number;
  /** Tasks counted (credited "done" only) and requests handed back. */
  tasks: number;
  handedBack: number;
};

/**
 * Staff time the robot's night stood for, an estimate (jury round 1: say how it is counted): each
 * task done and credited by the server at MINUTES_PER_TASK, less MINUTES_PER_HANDBACK for each
 * request it handed to a person.
 */
export function timeSaved(night: Night): TimeSaved {
  let gross = 0;
  let tasks = 0;
  for (const task of night.tasks.values()) {
    if (task.verdict !== "done") continue;
    gross += MINUTES_PER_TASK[task.kind] ?? MINUTES_OTHER;
    tasks += 1;
  }
  const handedBack = night.tally.handedBack;
  const handback = handedBack * MINUTES_PER_HANDBACK;
  return { gross, handback, net: Math.max(0, gross - handback), tasks, handedBack };
}

/** Minutes of staff time the robot's night stood for (see timeSaved). */
export function minutesSaved(night: Night): number {
  return timeSaved(night).net;
}

/** "12" from 10 hours up, "4,5" under: hours the way a shift lead says them. */
export function hoursLabel(minutes: number): string {
  const hours = minutes / 60;
  return hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1).replace(".", ",");
}

/** The lines of "Slik regner vi" under the hours figure: the assumption named, then the sum. */
export function timeSavedMethod(saved: TimeSaved): string[] {
  const kinds = Object.entries(MINUTES_PER_TASK)
    .map(([kind, minutes]) => `${requestKindLabel(kind).toLowerCase()} ${minutes}`)
    .join(", ");
  return [
    `Et anslag, ikke en måling. Hver oppgave roboten fullførte og dommeren i Wybe Night Shift-simulatoren godkjente, regnet i minutter en ansatt ville brukt: ${kinds} (annet ${MINUTES_OTHER}).`,
    `${saved.tasks} oppgaver = ${saved.gross} min. Minus ${MINUTES_PER_HANDBACK} min for hver av de ${saved.handedBack} roboten ga videre til en person (${saved.handback} min).`,
    `Til sammen ${saved.net} min, ca. ${hoursLabel(saved.net)} t.`,
  ];
}

/** A wall-clock "HH:MM" inside the night shift, 22:00–06:00. */
export function atNight(clock: string | null): boolean {
  if (!clock) return false;
  const hour = Number(clock.slice(0, 2));
  return Number.isFinite(hour) && (hour >= 22 || hour < 6);
}

export type NightTotals = {
  /** The robot's tasks done and credited, out of its tasks (src/features/nightshift/outcomes.ts). */
  done: number;
  total: number;
  /** What the night staff finished besides (staff and in-room voice requests, 22:00–06:00). */
  staffDone: number;
};

/**
 * The night's work, read from the one tally of the robot's night (the same figures Forespørsler,
 * Natteskift, Overlevering and the bell show), plus what the night staff did. Null until the night is in.
 */
export function nightTotals(data: Pick<DashboardData, "night" | "requests">): NightTotals | null {
  const night = data.night;
  if (!night) return null;
  const staffDone = data.requests.filter(
    (request) => (request.source === "personale" || request.source === "stemme") && request.status === "fullfort" && atNight(request.at),
  ).length;
  return { done: night.tally.done, total: night.tally.total, staffDone };
}

/**
 * "God morgen" 05–10, "God dag" 10–18, "God kveld" 18–24, and a plain "Hei" in the small hours
 * ("God natt" is what you say going to bed, not to someone starting a night shift).
 */
export function greetingWord(hour: number): string {
  if (hour >= 5 && hour < 10) return "God morgen";
  if (hour >= 10 && hour < 18) return "God dag";
  if (hour >= 18) return "God kveld";
  return "Hei";
}

/** Shared logins are named after the role ("Resepsjonist"): those greet the desk, as people say it. */
const ROLE_NAMES: Readonly<Record<string, string | null>> = {
  admin: null,
  resepsjonist: "resepsjonen",
  resepsjon: "resepsjonen",
  robotansvarlig: "robotansvarlig",
  robot: "robotansvarlig",
};

export function greeting(hour: number, name: string | null): string {
  const word = greetingWord(hour);
  const own = name?.trim() ?? "";
  if (!own) return word;
  const key = own.toLowerCase();
  const desk = key in ROLE_NAMES ? ROLE_NAMES[key] : own;
  return desk ? `${word}, ${desk}` : word;
}

export type Verdict = { text: string; good: boolean };

/** One honest sentence on the night, before any figure. */
export function nightVerdict(data: Pick<DashboardData, "nightStatus" | "robot">, totals: Pick<NightTotals, "done" | "total"> | null): Verdict {
  if (data.nightStatus === "loading") return { text: "Henter natten …", good: false };
  if (data.nightStatus === "error") return { text: "Natten er ikke lastet ennå.", good: false };
  if (!totals || data.nightStatus === "empty") return { text: "Ingen natt å vise ennå.", good: false };
  if (data.robot && !data.robot.ended) return { text: "Natten er i gang.", good: true };
  // No "Natten gikk fint." (jury round 2): a verdict can't weigh a wet floor; the facts line (nightFacts) says what happened.
  return { text: "Natten er over.", good: false };
}

export type NightFacts = {
  /** What is done, said in green: "73 oppgaver bekreftet". */
  done: string;
  /** What can hurt a guest and needs a person, said plainly: "3 våte gulv og 1 ukjent person trenger en eier". */
  attention: string | null;
};

/**
 * The night in one factual line instead of a verdict (jury round 2: "Natten gikk fint." in green beside
 * three unsigned wet floors and a stranger at seven doors). Green only for what is truly done: the
 * robot's "done" the referee confirmed. What needs a person is named, calmly, with its count.
 */
export function nightFacts({ confirmed, wetFloors, stranger }: { confirmed: number; wetFloors: number; stranger: boolean }): NightFacts {
  const done = `${confirmed} ${confirmed === 1 ? "oppgave" : "oppgaver"} bekreftet`;
  const needs = [wetFloors > 0 ? `${wetFloors} ${wetFloors === 1 ? "vått gulv" : "våte gulv"}` : null, stranger ? "1 ukjent person" : null].filter((part): part is string => part !== null);
  if (needs.length === 0) return { done, attention: null };
  return { done, attention: `${needs.join(" og ")} trenger en eier` };
}

/** What the day starts with: the rooms to clean before check-in (null for a role without Rom). */
export function daySummary(data: Pick<DashboardData, "rooms" | "role">): string | null {
  if (!data.rooms || !canAccess(data.role, "/rom")) return null;
  const dirty = data.rooms.filter((room) => room.status === "ma_vaskes").length;
  // A sentence never starts with a digit.
  return dirty === 0 ? "Ingen rom venter på renhold." : `Før innsjekk skal ${dirty === 1 ? "ett" : dirty} rom vaskes.`;
}

/** The line after the verdict: the night's work, then what the day starts with. */
export function nightSummary(data: Pick<DashboardData, "rooms" | "role">, totals: NightTotals | null): string | null {
  if (!totals) return null;
  const staff = totals.staffDone > 0 ? ` Nattevakten ordnet ${totals.staffDone} til.` : "";
  const work = `Roboten fullførte ${totals.done} av ${totals.total} oppdrag.${staff}`;
  const day = daySummary(data);
  return day ? `${work} ${day}` : work;
}

/** The hour of the night on screen (its shift clock), so the greeting matches it: "God morgen" at 05:58, whatever the wall says. */
export function shiftHour(night: Pick<Night, "clock"> | null): number | null {
  const hour = night?.clock ? Number(night.clock.slice(0, 2)) : Number.NaN;
  return Number.isFinite(hour) ? hour : null;
}

/** Where a figure comes from, said under the row: the robot's log, test data, or our estimate. */
export type FigureSource = "run-log" | "test" | "estimate";

export type Highlight = {
  id: string;
  label: string;
  /** Null: not known yet (a figure from the night while it loads, or a night that isn't there). */
  value: string | number | null;
  unit?: string;
  /** Said before the value, small: "ca." on an estimate. */
  prefix?: string;
  /** One quiet line under the label ("Snittpris 1 462 kr · RevPAR 1 259 kr"). */
  detail?: string;
  /** "Slik regner vi": how an estimate is made, one tap away. */
  method?: string[];
  source: FigureSource;
  tone: "default" | "success";
  /** The screen the figure belongs to: a role sees only figures of screens it may open. */
  route: string;
  /** Comes with the night: a skeleton while it loads, a dash when it failed. */
  fromNight: boolean;
};

/** Six figures at most, on one rule. */
export const MAX_HIGHLIGHTS = 6;

/**
 * The hotel's good news in figures, in the order a manager reads them: last night's rooms and money,
 * the robot's night, the rooms to sell, the guests. Filtered by what the role may open, six at most,
 * so the receptionist and the robot manager each get a full row of their own. The robot's figures
 * are the one tally of its night (nightTotals); occupancy and money are the booking system's
 * (rooms/pms.ts, the same as Gjester and Overlevering).
 */
export function selectHighlights(data: DashboardData): Highlight[] {
  const totals = nightTotals(data);
  const night = data.night;
  const rooms = data.rooms;
  // Klare til salg: the one figure Rom and Overlevering show too (rooms/money.ts), "av 36" everywhere.
  const ready = data.money?.readyToSell ?? null;
  const moneyLine = data.money ? moneyHeadline(data.money) : null;
  const checked = rooms ? rooms.filter((room) => room.status !== "ukjent").length : null;
  const total = rooms?.length ?? ROOMS_IN_HOTEL;
  const revenue = revenueLastNight(total);
  const belegg = occupancy(revenue, total);
  const saved = night ? timeSaved(night) : null;
  const aboveMinimum = data.stock.length - data.lowStock.length;

  const rating: Highlight | null = data.reviews
    ? {
        id: "fornoyd",
        label: "Gjester fornøyd",
        value: data.reviews.average.toFixed(1).replace(".", ","),
        unit: "av 5",
        source: "test",
        tone: data.reviews.average >= 4 ? "success" : "default",
        route: "/gjester",
        fromNight: false,
      }
    : null;

  const all: Highlight[] = ([
    {
      id: "belegg",
      label: "Belegg i natt",
      value: belegg,
      unit: "%",
      detail: `${revenue.roomsSold} av ${total} rom solgt`,
      source: "test",
      tone: belegg >= 75 ? "success" : "default",
      route: "/gjester",
      fromNight: false,
    },
    {
      id: "inntekt",
      label: "Losjiinntekt i natt",
      value: formatKroner(revenue.revenue),
      unit: "kr",
      detail: `Snittpris ${formatKroner(revenue.adr)} kr · RevPAR ${formatKroner(revenue.revpar)} kr`,
      source: "test",
      tone: "default",
      route: "/overlevering",
      fromNight: false,
    },
    {
      id: "oppgaver",
      label: "Robotens oppdrag i natt",
      value: totals ? totals.done : null,
      unit: totals ? `av ${totals.total}` : undefined,
      detail: night ? robotDetail(night) : undefined,
      source: "run-log",
      tone: "success",
      route: "/",
      fromNight: true,
    },
    {
      id: "spart",
      label: "Timer spart, anslag",
      value: saved ? hoursLabel(saved.net) : null,
      prefix: "ca.",
      unit: saved ? "t" : undefined,
      method: saved ? timeSavedMethod(saved) : undefined,
      source: "estimate",
      tone: "success",
      route: "/",
      fromNight: true,
    },
    {
      id: "klare",
      label: "Rom klare til salg",
      value: ready,
      unit: ready !== null ? `av ${total}` : undefined,
      detail: moneyLine ?? undefined,
      source: "run-log",
      tone: ready ? "success" : "default",
      route: "/rom",
      fromNight: true,
    },
    rating,
    { id: "bookinger", label: "Nye bookinger i dag", value: data.guests.bookedToday.length, source: "test", tone: "default", route: "/gjester", fromNight: false },
    { id: "sjekket", label: "Rom sjekket av roboten", value: checked, unit: checked !== null ? `av ${total}` : undefined, source: "run-log", tone: "success", route: "/hotell", fromNight: true },
    {
      id: "lager",
      label: "Varer over minimum",
      value: aboveMinimum,
      unit: `av ${data.stock.length}`,
      source: "test",
      tone: data.lowStock.length <= 1 ? "success" : "default",
      route: "/lager",
      fromNight: false,
    },
  ] satisfies (Highlight | null)[]).filter((figure): figure is Highlight => figure !== null);

  return all.filter((figure) => canAccess(data.role, figure.route)).slice(0, MAX_HIGHLIGHTS);
}

/** "Godkjent av dommeren (Wybe Night Shift-simulatoren): 73 av 73 · 8 avvist uten bestilling": the robot figure's line. */
export function robotDetail(night: Night): string {
  const { tally } = night;
  const parts = [`Godkjent av dommeren (Wybe Night Shift-simulatoren): ${tally.done} av ${tally.reported}`];
  if (tally.declined > 0) parts.push(`${tally.declined} avvist uten bestilling`);
  if (tally.cancelled > 0) parts.push(`${tally.cancelled} avlyst`);
  return parts.join(" · ");
}

const SOURCE_WORD: Record<FigureSource, string> = {
  "run-log": "Fra robotens natt (kjøringsloggen)",
  test: "Testdata til bookingsystemet er koblet til",
  estimate: "Anslag",
};

/**
 * The line under the figures: which come from the robot's log, which are test data, which are our
 * estimates, naming the figures shown ("Fra robotens natt: Robotens oppdrag, Rom klare til salg.").
 */
export function figureSources(figures: readonly Pick<Highlight, "label" | "source">[]): string {
  return (["run-log", "test", "estimate"] as const)
    .map((source) => {
      const labels = figures.filter((figure) => figure.source === source).map((figure) => figure.label.replace(/, anslag$/, ""));
      return labels.length > 0 ? `${SOURCE_WORD[source]}: ${labels.join(", ")}.` : null;
    })
    .filter(Boolean)
    .join(" ");
}
