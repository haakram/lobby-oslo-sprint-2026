import { canAccess } from "@/features/auth/roles";
import type { DashboardData } from "./data";
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

/** Minutes of staff time the robot's finished tasks stood for tonight (see MINUTES_PER_TASK). */
export function minutesSaved(night: Night): number {
  let minutes = 0;
  for (const task of night.tasks.values()) {
    if (task.outcome === "done") minutes += MINUTES_PER_TASK[task.kind] ?? MINUTES_OTHER;
  }
  return minutes;
}

/** "12" from 10 hours up, "4,5" under: hours the way a shift lead says them. */
export function hoursLabel(minutes: number): string {
  const hours = minutes / 60;
  return hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1).replace(".", ",");
}

/** A wall-clock "HH:MM" inside the night shift, 22:00–06:00. */
export function atNight(clock: string | null): boolean {
  if (!clock) return false;
  const hour = Number(clock.slice(0, 2));
  return Number.isFinite(hour) && (hour >= 22 || hour < 6);
}

export type NightTotals = { done: number; total: number };

/**
 * The night's tasks, the robot's and the night staff's together: done out of all that came in.
 * Null until the night is in.
 */
export function nightTotals(data: Pick<DashboardData, "night" | "requests">): NightTotals | null {
  const night = data.night;
  if (!night) return null;
  const robotTotal = Math.max(night.tasks.size, night.tasksDone + night.tasksFailed);
  const staff = data.requests.filter((request) => (request.source === "personale" || request.source === "stemme") && atNight(request.at));
  const staffDone = staff.filter((request) => request.status === "fullfort").length;
  return { done: night.tasksDone + staffDone, total: robotTotal + staff.length };
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

/** A night counts as gone well when at least this share of its tasks were done. */
export const WENT_WELL = 0.8;

export type Verdict = { text: string; good: boolean };

/** One honest sentence on the night, before any figure. */
export function nightVerdict(data: Pick<DashboardData, "nightStatus" | "robot">, totals: NightTotals | null): Verdict {
  if (data.nightStatus === "loading") return { text: "Henter natten …", good: false };
  if (data.nightStatus === "error") return { text: "Natten er ikke lastet ennå.", good: false };
  if (!totals || data.nightStatus === "empty") return { text: "Ingen natt å vise ennå.", good: false };
  if (data.robot && !data.robot.ended) return { text: "Natten er i gang.", good: true };
  if (totals.total === 0 || totals.done / totals.total >= WENT_WELL) return { text: "Natten gikk fint.", good: true };
  return { text: "Natten er over.", good: false };
}

/** The line after the verdict: the night's work, then what the day starts with. */
export function nightSummary(data: Pick<DashboardData, "rooms" | "role">, totals: NightTotals | null): string | null {
  if (!totals) return null;
  const work = `Roboten og nattevakten fullførte ${totals.done} av ${totals.total} oppgaver`;
  if (!data.rooms || !canAccess(data.role, "/rom")) return `${work}.`;
  const dirty = data.rooms.filter((room) => room.status === "ma_vaskes").length;
  return dirty > 0 ? `${work}, og ${dirty} rom skal vaskes før innsjekk.` : `${work}, og ingen rom venter på renhold.`;
}

export type Highlight = {
  id: string;
  label: string;
  /** Null: not known yet (a figure from the night while it loads, or a night that isn't there). */
  value: string | number | null;
  unit?: string;
  tone: "default" | "success";
  /** The screen the figure belongs to: a role sees only figures of screens it may open. */
  route: string;
  /** Comes with the night: a skeleton while it loads, a dash when it failed. */
  fromNight: boolean;
};

/** Six figures at most, on one rule. */
export const MAX_HIGHLIGHTS = 6;

/**
 * The hotel's good news in figures, in the order a manager reads them: today's business, the
 * night's work, the rooms, the guests. Filtered by what the role may open, six at most, so the
 * receptionist and the robot manager each get a full row of their own.
 */
export function selectHighlights(data: DashboardData): Highlight[] {
  const totals = nightTotals(data);
  const night = data.night;
  const rooms = data.rooms;
  const ready = rooms?.filter((room) => room.status === "klar").length ?? null;
  const free = rooms ? rooms.filter((room) => room.status === "klar" || room.status === "ma_vaskes").length : null;
  const checked = rooms ? rooms.filter((room) => room.status !== "ukjent").length : null;
  const total = rooms?.length ?? ROOMS_IN_HOTEL;
  const occupancy = Math.round((data.guests.roomsTonight / ROOMS_IN_HOTEL) * 100);
  const aboveMinimum = data.stock.length - data.lowStock.length;

  const rating: Highlight | null = data.reviews
    ? {
        id: "fornoyd",
        label: "Gjester fornøyd",
        value: data.reviews.average.toFixed(1).replace(".", ","),
        unit: "av 5",
        tone: data.reviews.average >= 4 ? "success" : "default",
        route: "/gjester",
        fromNight: false,
      }
    : null;

  const all: Highlight[] = ([
    { id: "bookinger", label: "Nye bookinger i dag", value: data.guests.bookedToday.length, tone: "default", route: "/gjester", fromNight: false },
    { id: "belegg", label: "Belegg i natt", value: occupancy, unit: "%", tone: occupancy >= 75 ? "success" : "default", route: "/gjester", fromNight: false },
    {
      id: "oppgaver",
      label: "Oppgaver fullført i natt",
      value: totals ? totals.done : null,
      unit: totals ? `av ${totals.total}` : undefined,
      tone: "success",
      route: "/",
      fromNight: true,
    },
    { id: "spart", label: "Timer spart av roboten", value: night ? hoursLabel(minutesSaved(night)) : null, unit: night ? "t" : undefined, tone: "success", route: "/", fromNight: true },
    {
      id: "klare",
      label: "Rom klare til salg",
      value: ready,
      unit: free !== null ? `av ${free} ledige` : undefined,
      tone: ready ? "success" : "default",
      route: "/rom",
      fromNight: true,
    },
    rating,
    { id: "sjekket", label: "Rom sjekket av roboten", value: checked, unit: checked !== null ? `av ${total}` : undefined, tone: "success", route: "/hotell", fromNight: true },
    {
      id: "lager",
      label: "Varer over minimum",
      value: aboveMinimum,
      unit: `av ${data.stock.length}`,
      tone: data.lowStock.length <= 1 ? "success" : "default",
      route: "/lager",
      fromNight: false,
    },
  ] satisfies (Highlight | null)[]).filter((figure): figure is Highlight => figure !== null);

  return all.filter((figure) => canAccess(data.role, figure.route)).slice(0, MAX_HIGHLIGHTS);
}
