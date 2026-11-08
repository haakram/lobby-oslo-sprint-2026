import type { RunLine } from "@/features/nightshift/runlog";

/**
 * A short night for the tests of the room checks and the handover: one room the robot checked too
 * early (301, 22:40), one empty and tidy after 01:00 (311, booked in the system), one guest the system
 * doesn't have (210), one that agrees (203), a noise complaint settled and a towel run failed.
 */
export const TEST_NIGHT: RunLine[] = [
  { v: 1, type: "start", shift: "w2-0000000000000000000000000000000a", mode: "practice", seed: 1, t: 1794058477 },
  { v: 1, type: "state", clock: "22:00:00", location: "charging-dock", score: 0 },
  { v: 1, type: "state", clock: "22:40:13", location: "room-301", score: 0 },
  { v: 1, type: "decision", kind: "room_status", data: { room: "room-301", status: "klar", source: "room_check", note: "Nobody is here. The room is tidy." } },
  { v: 1, type: "decision", kind: "request", data: { request: "R-001", kind: "noise", text: "Noise near 322" } },
  { v: 1, type: "decision", kind: "task_start", data: { request: "R-001", kind: "noise", room: "room-302" } },
  { v: 1, type: "state", clock: "22:50:00", location: "corridor-3a", score: 10 },
  { v: 1, type: "decision", kind: "work_order", data: { room: "room-302", place: "corridor-3a", type: "stoy", text: "Støyklage nær rom 302: ba rom 302 dempe seg", request: "R-001" } },
  { v: 1, type: "decision", kind: "task_done", data: { request: "R-001" } },
  { v: 1, type: "state", clock: "03:14:30", location: "room-311", score: 20 },
  { v: 1, type: "decision", kind: "room_status", data: { room: "room-311", status: "klar", source: "room_check", note: "Nobody is here. The room is tidy." } },
  { v: 1, type: "state", clock: "03:15:28", location: "room-210", score: 20 },
  { v: 1, type: "decision", kind: "room_status", data: { room: "room-210", status: "opptatt", source: "knock", note: "Ms Bakke opens the door of room-210." } },
  { v: 1, type: "state", clock: "04:00:00", location: "room-203", score: 20 },
  { v: 1, type: "decision", kind: "room_status", data: { room: "room-203", status: "opptatt", source: "knock", note: "Mx Holm opens the door of room-203." } },
  { v: 1, type: "decision", kind: "request", data: { request: "R-002", kind: "amenity", text: "Two towels for room 138" } },
  { v: 1, type: "decision", kind: "task_start", data: { request: "R-002", kind: "amenity", room: "room-138" } },
  { v: 1, type: "state", clock: "04:20:00", location: "lobby", score: 20 },
  { v: 1, type: "decision", kind: "task_failed", data: { request: "R-002" } },
  { v: 1, type: "state", clock: "05:58:07", location: "charging-dock", score: 20 },
  { v: 1, type: "end", score: 20, requests_served: 1, reason: "server ended: time" },
];

export const TEST_NIGHT_JSONL = TEST_NIGHT.map((line) => JSON.stringify(line)).join("\n");
