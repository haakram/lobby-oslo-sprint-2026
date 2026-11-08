/**
 * TODO(phase-3): replace with the request desk integration (staff app, in-room voice, PMS messages).
 * Test data: the requests that did not come through the robot or the phone, tonight and this morning.
 * Made-up only.
 */

export type ManualRequest = {
  id: string;
  /** Where it came from. */
  source: "personale" | "stemme";
  kind: string;
  room: string | null;
  text: string;
  /** Wall clock, HH:MM. */
  at: string;
  handler: string;
  status: "venter" | "pagar" | "fullfort";
};

export const MANUAL_REQUESTS: readonly ManualRequest[] = [
  { id: "req-m1", source: "stemme", kind: "Utstyr", room: "room-212", text: "To ekstra puter og et pledd.", at: "07:12", handler: "Mariam Osei", status: "fullfort" },
  { id: "req-m2", source: "personale", kind: "Romservice", room: "room-134", text: "Frokost på rommet 08:30, fire personer.", at: "06:48", handler: "Linnea Berg", status: "pagar" },
  { id: "req-m3", source: "stemme", kind: "Beskjed", room: "room-309", text: "Vil ha hjelp med bagasjen ned til lobbyen 11:00.", at: "07:30", handler: "Resepsjon", status: "venter" },
  { id: "req-m4", source: "personale", kind: "Oppfølging", room: "room-203", text: "Bekreft sen utsjekk 14:00.", at: "06:20", handler: "Siri Haugen", status: "fullfort" },
  { id: "req-m5", source: "personale", kind: "Utstyr", room: "room-134", text: "Ekstra dyne til barnesengen.", at: "23:40", handler: "Kjersti Lund", status: "fullfort" },
  { id: "req-m6", source: "stemme", kind: "Beskjed", room: "room-302", text: "Vekking 06:15, takk.", at: "01:15", handler: "Kjersti Lund", status: "fullfort" },
  { id: "req-m7", source: "personale", kind: "Romservice", room: "room-303", text: "Te og kjeks til rommet.", at: "04:50", handler: "Kjersti Lund", status: "fullfort" },
];
