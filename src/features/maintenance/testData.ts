/**
 * TODO(phase-3): replace with the maintenance system (work-order tickets, assignment, history).
 * Test data: the work orders staff reported themselves, beside the robot's overnight findings from
 * the run log. Made-up only: a well-run day, where most of what staff reported is fixed already.
 */

export type Priority = "hoy" | "middels" | "lav";

export type ManualOrder = {
  id: string;
  type: string;
  text: string;
  room: string | null;
  place: string | null;
  priority: Priority;
  /** Who has it, or null when nobody has taken it yet. */
  assignee: string | null;
  /** Reported, HH:MM today or the day before. */
  at: string;
  reportedBy: string;
  /** The room can't be sold until this is fixed. */
  outOfOrder?: boolean;
  /** Fixed already, at HH:MM: it comes in as Løst. */
  resolvedAt?: string;
};

export const MANUAL_ORDERS: readonly ManualOrder[] = [
  { id: "wo-m1", type: "teknisk", text: "Ny dusjarmatur monteres i dag. Rommet selges ikke før den er på plass.", room: "room-107", place: null, priority: "middels", assignee: "Trond Eikeland", at: "16:40", reportedBy: "Beata Kowalczyk", outOfOrder: true },
  { id: "wo-m2", type: "teknisk", text: "Heis 2 piper ved hver stopp i 3. etasje.", room: null, place: "elevator-3", priority: "middels", assignee: "Trond Eikeland", at: "18:05", reportedBy: "Omar Haddad", resolvedAt: "19:30" },
  { id: "wo-m3", type: "annet", text: "Lyspære mangler i korridor 3B, mørkt ved rom 330.", room: null, place: "corridor-3b", priority: "lav", assignee: "Trond Eikeland", at: "21:10", reportedBy: "Kjersti Lund", resolvedAt: "21:40" },
  { id: "wo-m4", type: "teknisk", text: "Termostaten holdt ikke varmen. Byttet, rommet holder 21 grader.", room: "room-213", place: null, priority: "middels", assignee: "Trond Eikeland", at: "07:05", reportedBy: "Ana Pereira", resolvedAt: "08:10" },
  { id: "wo-m5", type: "teknisk", text: "Dørlåsen blinket rødt. Nytt batteri satt i.", room: "room-205", place: null, priority: "lav", assignee: "Trond Eikeland", at: "17:20", reportedBy: "Siri Haugen", resolvedAt: "17:45" },
  { id: "wo-m6", type: "annet", text: "Vannkokeren virket ikke. Byttet med en ny fra lageret.", room: "room-322", place: null, priority: "lav", assignee: "Kjersti Lund", at: "23:05", reportedBy: "Kjersti Lund", resolvedAt: "23:15" },
  { id: "wo-m7", type: "annet", text: "Lampen ved resepsjonen flimrer. Ny pære er bestilt.", room: null, place: "front-desk", priority: "lav", assignee: "Trond Eikeland", at: "06:30", reportedBy: "Siri Haugen" },
];
