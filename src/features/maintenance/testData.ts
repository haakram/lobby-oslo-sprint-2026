/**
 * TODO(phase-3): replace with the maintenance system (work-order tickets, assignment, history).
 * Test data: the work orders staff reported themselves, beside the robot's overnight findings from
 * the run log. Made-up only.
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
};

export const MANUAL_ORDERS: readonly ManualOrder[] = [
  { id: "wo-m1", type: "teknisk", text: "Lekkasje under vasken på badet. Rommet er stengt til det er tett.", room: "room-107", place: null, priority: "hoy", assignee: "Trond Eikeland", at: "16:40", reportedBy: "Beata Kowalczyk", outOfOrder: true },
  { id: "wo-m2", type: "teknisk", text: "Heis 2 piper ved hver stopp i 3. etasje.", room: null, place: "elevator-3", priority: "middels", assignee: null, at: "18:05", reportedBy: "Omar Haddad" },
  { id: "wo-m3", type: "annet", text: "Lyspære mangler i korridor 3B, mørkt ved rom 330.", room: null, place: "corridor-3b", priority: "lav", assignee: "Trond Eikeland", at: "21:10", reportedBy: "Kjersti Lund" },
  { id: "wo-m4", type: "teknisk", text: "Termostaten holder ikke, rommet blir ikke varmere enn 17 grader.", room: "room-213", place: null, priority: "middels", assignee: null, at: "07:05", reportedBy: "Ana Pereira", outOfOrder: true },
];
