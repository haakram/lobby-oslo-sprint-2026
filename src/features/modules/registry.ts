import type { Role } from "@/features/auth/roles";
import type { RegenName } from "@/ui/icons/regenPaths";

/**
 * The hotel's modules, in one place. Fettero is one place to see and run the whole hotel; the robot is
 * one module among many. Everything that lists modules reads this file: the navigation (`src/ui/nav.ts`),
 * who may open what (`src/features/auth/roles.ts` builds its route table from `roles` here), the
 * widgets on Oversikt (`src/features/dashboard/widgets.tsx` maps `id` → component) and the "Nå" band.
 *
 * Adding a module: one entry here, a page under `src/app/<route>/`, a screen under
 * `src/features/<domain>/`, and (optionally) a widget registered in the dashboard's widget map.
 * Plain data and pure functions only: the proxy imports this file on the server.
 */

export type ModuleGroupId = "hotellet" | "drift" | "roboten" | "resepsjon" | "utleie";

/**
 * A service a module needs from the server. Without it the menu leaves the module out (the page still
 * answers and says what is missing), so the demo rail has no dead ends.
 */
export type ModuleService = "voice-agent";

export const MODULE_GROUPS: readonly { id: ModuleGroupId; label: string }[] = [
  { id: "hotellet", label: "Hotellet" },
  { id: "drift", label: "Drift" },
  { id: "roboten", label: "Roboten" },
  { id: "resepsjon", label: "Resepsjon" },
  // The Airbnb host's own app (role "host"): their apartments, not the hotel.
  { id: "utleie", label: "Utleie" },
];

export type ModuleId =
  | "oversikt"
  | "rom"
  | "gjester"
  | "ruter"
  | "overlevering"
  | "natt"
  | "foresporsler"
  | "vedlikehold"
  | "lager"
  | "ansatte"
  | "hotell3d"
  | "natteskift"
  | "oyne"
  | "stemme"
  | "resepsjon"
  | "vert"
  | "vert-meldinger"
  | "vert-bookinger"
  | "vert-drift";

export type HotelModule = {
  id: ModuleId;
  /** The name in the navigation and as the screen's title. */
  name: string;
  /** A shorter name for the phone bar, when the full one won't fit under an icon. */
  short?: string;
  /** One line on what the screen is, shown in the menu sheet. */
  hint: string;
  icon: RegenName;
  route: string;
  group: ModuleGroupId;
  /**
   * Who may open it besides admin, who opens everything. The proxy enforces this on the server
   * (`roles.ts`), the navigation only hides what a role can't open.
   */
  roles: readonly Exclude<Role, "admin">[];
  /** Goes in the phone bar (the first four the role may open) before the rest fall into Meny. */
  pinned?: boolean;
  /** Has a widget on Oversikt. */
  widget?: boolean;
  /** Which source its figures come from, said on the screen so nobody trusts test data as real. */
  data: "run-log" | "reception" | "test" | "mixed" | "none";
  /** A service the screen can't work without; the menu shows it only when the server has it. */
  needs?: ModuleService;
};

const BOTH = ["receptionist", "robot"] as const;

export const MODULES: readonly HotelModule[] = [
  // Hotellet
  { id: "oversikt", name: "Oversikt", hint: "Hele hotellet nå", icon: "layout-grid", route: "/", group: "hotellet", roles: BOTH, pinned: true, data: "mixed" },
  { id: "rom", name: "Rom og renhold", short: "Rom", hint: "Romstatus, renholdere og dagens runde", icon: "key", route: "/rom", group: "hotellet", roles: BOTH, pinned: true, widget: true, data: "mixed" },
  { id: "gjester", name: "Gjester og bookinger", short: "Gjester", hint: "Ankomster, avreiser, bookinger og hensyn", icon: "users", route: "/gjester", group: "hotellet", roles: ["receptionist"], pinned: true, widget: true, data: "mixed" },
  { id: "ruter", name: "Ruter", hint: "Korteste vei mellom etasjene", icon: "route", route: "/ruter", group: "hotellet", roles: BOTH, data: "run-log" },
  // Drift
  { id: "overlevering", name: "Overlevering 06:00", short: "Overlevering", hint: "Natten oppsummert for morgenvakten, med kvittering", icon: "clipboard-check", route: "/overlevering", group: "drift", roles: ["receptionist"], data: "mixed" },
  // The night clerk's own input (jury round 5): what the night staff saw, as the same run-log lines the robot writes.
  { id: "natt", name: "Nattevaktens logg", short: "Logg", hint: "Rom, farer og notater fra nattevakten til overleveringen", icon: "pencil", route: "/natt", group: "drift", roles: ["receptionist"], data: "mixed" },
  { id: "foresporsler", name: "Forespørsler", hint: "Alt gjestene ber om, fra telefon, robot og personale", icon: "inbox", route: "/foresporsler", group: "drift", roles: BOTH, pinned: true, widget: true, data: "mixed" },
  { id: "vedlikehold", name: "Vedlikehold", hint: "Arbeidsordre: robotens funn og meldte feil", icon: "tool", route: "/vedlikehold", group: "drift", roles: ["robot"], pinned: true, widget: true, data: "mixed" },
  { id: "lager", name: "Lager og lin", short: "Lager", hint: "Lin og utstyr per lagerrom", icon: "archive", route: "/lager", group: "drift", roles: ["robot"], widget: true, data: "test" },
  { id: "ansatte", name: "Ansatte og vakter", short: "Vakter", hint: "Hvem som er på vakt, og hva de har", icon: "calendar", route: "/ansatte", group: "drift", roles: ["receptionist"], widget: true, data: "test" },
  // Roboten
  { id: "hotell3d", name: "3D-kart", hint: "Gå rundt i hotellet og følg roboten", icon: "cube", route: "/hotell", group: "roboten", roles: ["robot"], pinned: true, widget: true, data: "run-log" },
  { id: "natteskift", name: "Natteskift", hint: "Robotens natt, steg for steg", icon: "moon", route: "/natteskift", group: "roboten", roles: ["robot"], data: "run-log" },
  { id: "oyne", name: "Robotens øyne", short: "Øyne", hint: "Det roboten ser og kjenner igjen", icon: "eye", route: "/oyne", group: "roboten", roles: ["robot"], data: "none" },
  { id: "stemme", name: "Snakk gjennom roboten", short: "Stemme", hint: "Snakk med roboten på ditt eget språk", icon: "mic", route: "/stemme", group: "roboten", roles: ["robot"], data: "none", needs: "voice-agent" },
  // Resepsjon
  { id: "resepsjon", name: "Resepsjon", hint: "Telefonen, bookinger og beskjeder", icon: "phone", route: "/resepsjon", group: "resepsjon", roles: ["receptionist"], widget: true, data: "reception" },
  // Utleie (the host only; screens in src/features/host). Not in the admin's hotel rail: an admin reaches
  // it from the user plate (Andre visninger), and sees the group only while on one of its screens.
  { id: "vert", name: "Mine boliger", short: "Boliger", hint: "Dagens bytter og status i hver bolig", icon: "home", route: "/vert", group: "utleie", roles: ["host"], pinned: true, data: "test" },
  { id: "vert-meldinger", name: "Gjestemeldinger", short: "Meldinger", hint: "Meldinger fra gjestene og svarene som er sendt", icon: "message", route: "/vert/meldinger", group: "utleie", roles: ["host"], pinned: true, data: "test" },
  { id: "vert-bookinger", name: "Bookinger og inntekt", short: "Bookinger", hint: "Kalenderen for de neste 14 dagene og månedens tall", icon: "calendar", route: "/vert/bookinger", group: "utleie", roles: ["host"], pinned: true, data: "test" },
  { id: "vert-drift", name: "Forsyninger og vedlikehold", short: "Drift", hint: "Håndklær, papir og kaffe per bolig, og det som skal fikses", icon: "archive", route: "/vert/drift", group: "utleie", roles: ["host"], pinned: true, data: "test" },
];

/**
 * The pilot (jury round 3, the product juror: "ship the cut you claim"): the screens the first pilot hotel works in, in
 * this order: the morning manager's four and, after the handover, the night clerk's log that feeds it
 * (jury round 5: a hotel without a robot). The admin's menu (the siri, jury and admin accounts) shows these
 * under *Piloten*, with Oversikt as the start page above them; every other hotel module stays reachable
 * under one collapsed *Utenfor piloten* group (`groupsFor` in `src/ui/nav.ts`). The other roles keep their
 * own menus, and nothing here changes who may open what.
 */
export const PILOT_MODULES: readonly ModuleId[] = ["overlevering", "natt", "rom", "foresporsler", "natteskift"];

export function moduleById(id: ModuleId): HotelModule {
  const found = MODULES.find((module) => module.id === id);
  if (!found) throw new Error(`Unknown module ${id}`);
  return found;
}

/** The routes a non-admin role may open, read off the registry. */
export function moduleRoutesFor(role: Exclude<Role, "admin">): string[] {
  return MODULES.filter((module) => module.roles.includes(role)).map((module) => module.route);
}
