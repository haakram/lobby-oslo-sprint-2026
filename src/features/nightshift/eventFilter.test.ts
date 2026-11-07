import { describe, expect, it } from "vitest";
import type { ReplayEvent, Task } from "@/features/replay";
import { failures } from "./eventFilter";

function task(id: string, start: number, end: number | null, outcome: Task["outcome"], note: string | null = null): Task {
  return { id, kind: "amenity", room: "room-101", item: "towel", text: "", start, end, outcome, points: null, note };
}

const FAILED_EVENT = { id: 1, t: 200, clock: "22:03:20", kind: "task_failed", request: "R-002", text: "towel out of stock (+0 p)" } as unknown as ReplayEvent;

describe("failures", () => {
  const tasks = [
    task("R-001", 0, 100, "done"),
    task("R-002", 150, 200, "failed"),
    // Never reported; the shift ended on it, so the timeline marked it failed without a task_failed line.
    task("R-003", 300, 900, "failed", "Skiftet tok slutt"),
    task("R-004", 400, null, null),
  ];

  it("counts what the figure counts: every task ended by t that is not done", () => {
    const list = failures(tasks, [FAILED_EVENT], 1, 900);
    expect(list.map((failure) => failure.task.id)).toEqual(["R-003", "R-002"]);
  });

  it("keeps a task with no task_failed line, with its end as the clock and its note as the reason", () => {
    const [ended] = failures(tasks, [FAILED_EVENT], 1, 900);
    expect(ended).toMatchObject({ reason: "Skiftet tok slutt", clock: "22:15:00" });
  });

  it("takes the logged reason, without points, and the logged clock", () => {
    const failed = failures(tasks, [FAILED_EVENT], 1, 900).find((failure) => failure.task.id === "R-002");
    expect(failed).toMatchObject({ reason: "towel out of stock", clock: "22:03:20" });
  });

  it("leaves out what has not ended yet at t", () => {
    expect(failures(tasks, [FAILED_EVENT], 1, 250).map((failure) => failure.task.id)).toEqual(["R-002"]);
    expect(failures(tasks, [], 0, 120)).toEqual([]);
  });
});
