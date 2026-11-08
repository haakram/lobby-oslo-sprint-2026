import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { doneBasis, unfinishedTasks } from "./conduct";
import { fromOpenRmf, rmfClock, type RmfSample, rmfTiles } from "./openRmf";
import { RobotJudgementCard, sourceOf } from "./RobotJudgementCard";
import { SHIFT_ID } from "./runlog";

const SAMPLE = JSON.parse(readFileSync(resolve(process.cwd(), "src/features/nightshift/fixtures/open-rmf-night.json"), "utf8")) as RmfSample;
const SCHEMA = JSON.parse(readFileSync(resolve(process.cwd(), "docs/runlog.schema.json"), "utf8")) as { $defs: Record<string, unknown> };

describe("fromOpenRmf: Open-RMF task and fleet states as run log v1", () => {
  const lines = fromOpenRmf(SAMPLE);

  it("starts with a start line that names its source and fits the v1 shift id, and ends with an end line", () => {
    const start = lines[0];
    expect(start.type).toBe("start");
    expect(start.type === "start" && SHIFT_ID.test(start.shift)).toBe(true);
    expect(sourceOf(lines)).toBe("open-rmf");
    expect(lines.at(-1)).toMatchObject({ type: "end", score: 0, requests_served: 4 });
    expect(fromOpenRmf(SAMPLE)).toEqual(lines); // the same every time
  });

  it("puts the night in hotel time, Oslo: the first task starts 22:30, the last 05:35", () => {
    const clocks = lines.filter((line) => line.type === "state").map((line) => (line.type === "state" ? line.clock : null));
    expect(clocks[0]).toBe("22:10:00");
    expect(clocks.at(-1)).toBe("05:35:00");
    expect(rmfClock(Date.UTC(2026, 10, 7, 21, 30))).toBe("22:30:00");
  });

  it("maps each task to task_start and task_done/task_failed with the room, and the battery to per cent", () => {
    const starts = lines.filter((line) => line.type === "decision" && line.kind === "task_start");
    expect(starts.map((line) => (line.type === "decision" ? line.data?.room : null))).toEqual(["room-204", "room-311", "room-212", "room-305", null, "room-136", "room-203"]);
    const done = lines.filter((line) => line.type === "decision" && line.kind === "task_done");
    expect(done).toHaveLength(4);
    expect(lines.find((line) => line.type === "state" && line.battery !== undefined)).toMatchObject({ battery: 96 });
  });

  it("reads the evidence from completed phase events: door opened = the lock trail, photo, compartment, recipient PIN", () => {
    const evidence = lines
      .filter((line) => line.type === "decision" && line.kind === "task_done")
      .map((line) => (line.type === "decision" ? (line.data?.evidence as { signal: string }[]).map((entry) => entry.signal) : []));
    expect(evidence).toEqual([["lock", "photo"], ["guest_ack", "compartment"], ["guest_ack", "compartment"], ["photo"]]);
  });

  it("gives each signal its origin: a door opened with the robot's own credential is the robot's, the guest's PIN is the guest's", () => {
    const first = lines.find((line) => line.type === "decision" && line.kind === "task_done");
    expect(first?.type === "decision" && first.data?.evidence).toEqual([
      { signal: "lock", at: "22:41:00", detail: "Door [door:room_204] opened (lock audit: robot credential)", origin: "robot" },
      { signal: "photo", at: "22:41:00", detail: "Photo taken at dropoff (towel on the rack)", origin: "robot" },
    ]);
  });

  it("confirms a done only with an outside signal: 2 of 4 (compartment + PIN), 1 the robot's own observation, 1 single signal; no referee", () => {
    const basis = doneBasis(lines);
    expect(basis.evidence).toEqual({ reported: 4, confirmed: 2, robotOnly: 1, signals: ["guest_ack", "compartment"], outside: ["guest_ack"] });
    expect(basis.afterRise.reported + basis.own.reported).toBe(0);
  });

  it("lists the failed and cancelled tasks and the one still open at the end", () => {
    const { ended, open } = unfinishedTasks(lines);
    expect(ended).toEqual([
      { request: "delivery.pillow.0004", status: "failed", note: "Door [door:room_305] did not open", room: "room-305" },
      { request: "delivery.charger.0006", status: "skipped", note: "canceled: front desk took it", room: "room-136" },
    ]);
    expect(open.map((task) => task.request)).toEqual(["delivery.tray.0007"]);
  });

  it("writes only line types and decision kinds the schema describes", () => {
    const types = new Set(lines.map((line) => line.type));
    for (const type of types) expect(SCHEMA.$defs).toHaveProperty(type);
  });
});

describe("the judgement card on the Open-RMF sample", () => {
  it("names the source, judges done by the evidence rule, lists what is unfinished, and shows no Wybe-only rows or ledger", () => {
    render(<RobotJudgementCard lines={fromOpenRmf(SAMPLE)} />);
    const card = screen.getByRole("region", { name: "Robotens vurderinger i natt" });
    expect(card).toHaveTextContent("Fra Open-RMF-eksempelet (testdata)");
    expect(card).toHaveTextContent("2 av 4«Ferdig» bekreftet");
    expect(card).toHaveTextContent(
      "2 med et signal utenfra roboten (gjestens bekreftelse); skuffsensor er robotens eget signal. 1 er robotens egen observasjon: to signaler, begge fra roboten. 1 har bare ett signal og står som «ikke bekreftet».",
    );
    expect(card).toHaveTextContent("3Oppgaver ikke fullført");
    expect(card).toHaveTextContent("delivery.pillow.0004 (rom 305): Door [door:room_305] did not open");
    expect(card).toHaveTextContent("Åpen ved slutten: delivery.tray.0007 (rom 203).");
    expect(card).not.toHaveTextContent(/Skilt for vått gulv|nøkkelkort|Ikke forstyrr|live-netter|ledger\.csv/);
    expect(card).toHaveTextContent("Her finnes ingen dommer.");
  });
});

describe("rmfTiles (round 6: the switch drives Natteskift's figures)", () => {
  it("counts the sample's tasks, what an outside signal confirmed, what is unfinished, and the last battery and clock", () => {
    const tiles = rmfTiles(fromOpenRmf(SAMPLE));
    expect(tiles).toMatchObject({ tasks: 7, done: 4, reported: 4, unfinished: 3, battery: 38, clock: "05:35:00" });
    expect(tiles.confirmed + tiles.robotOnly).toBeLessThanOrEqual(tiles.reported);
  });
});
