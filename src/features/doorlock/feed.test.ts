import { describe, expect, it } from "vitest";
import { parseRunLog } from "@/features/nightshift/runlog";
import { pmsLastNight } from "@/features/rooms/pms";
import { DOOR_LOCK_SAMPLE, doorLockFlags, doorLockLines, doorLockSignals, doorSignalText } from "./feed";

const TODAY = "2026-11-08";

describe("the door lock's sample feed", () => {
  it("is a run log: every line reads as v1, one room_signal per room of the demo hotel, from the door lock", () => {
    const parsed = parseRunLog(DOOR_LOCK_SAMPLE);
    expect(parsed.skipped).toBe(0);
    expect(parsed.lines).toHaveLength(36);
    const signals = doorLockSignals(parsed.lines);
    expect(signals.size).toBe(36);
    for (const line of parsed.lines) expect(line).toMatchObject({ v: 1, type: "decision", kind: "room_signal", data: { source: "door_lock" } });
  });

  it("carries one derived signal per room and never who: no card id, no name, no entry list", () => {
    for (const line of doorLockLines()) {
      if (line.type !== "decision") throw new Error("not a decision");
      const keys = new Set(Object.keys(line.data ?? {}));
      expect(keys).toEqual(new Set(line.data?.signal === "card_in" ? ["room", "signal", "source"] : ["room", "signal", "since", "source"]));
    }
  });

  it("never carries a time on card_in, and no guest's clock at all: no_card says only the window from 18:00", () => {
    const lines = doorLockLines();
    const cardIn = lines.filter((line) => line.type === "decision" && line.data?.signal === "card_in");
    expect(cardIn.length).toBeGreaterThan(0);
    for (const line of cardIn) expect(line.type === "decision" && line.data).not.toHaveProperty("since");
    for (const line of lines) if (line.type === "decision" && line.data?.signal === "no_card") expect(line.data.since).toBeNull();
    for (const signal of doorLockSignals(lines).values()) expect(signal.since).toBeNull();
    // Nothing that reads like a clock anywhere in the feed.
    expect(DOOR_LOCK_SAMPLE).not.toMatch(/\d{2}:\d{2}/);
  });

  it("drops a time a feed sends on card_in anyway (minimised on read)", () => {
    const lines = parseRunLog('{"v":1,"type":"decision","kind":"room_signal","data":{"room":"room-212","signal":"card_in","since":"00:35:00","source":"door_lock"}}').lines;
    const signal = doorLockSignals(lines).get("room-212")!;
    expect(signal.since).toBeNull();
    expect(doorSignalText(signal)).toBe("kort i energibryteren");
  });

  it("says each signal in the desk's words, without a guest's time", () => {
    const signals = doorLockSignals(doorLockLines());
    expect(doorSignalText(signals.get("room-213")!)).toBe("ingen kort i energibryteren siden kl. 18:00");
    expect(doorSignalText(signals.get("room-210")!)).toBe("kort i energibryteren");
    expect(doorSignalText(signals.get("room-132")!)).toBe("ingen kort i energibryteren siden kl. 18:00");
  });

  it("flags where the lock and the booking system disagree: a booked room with no card, a card in a free room", () => {
    const flags = doorLockFlags(doorLockSignals(doorLockLines()), pmsLastNight(TODAY));
    expect(flags.map((flag) => [flag.room, flag.kind])).toEqual([
      ["room-210", "unbooked"],
      ["room-213", "empty"],
    ]);
    expect(flags[1]).toMatchObject({ guest: "Ola Nygård", departure: "2026-11-07" });
  });

  it("reads only the door lock's own lines (a staff or robot room line is not a lock signal)", () => {
    const lines = parseRunLog(
      [
        '{"v":1,"type":"decision","kind":"room_signal","data":{"room":"room-213","signal":"no_card","since":null,"source":"staff"}}',
        '{"v":1,"type":"decision","kind":"room_status","data":{"room":"room-213","status":"klar","source":"room_check"}}',
        '{"v":1,"type":"decision","kind":"room_signal","data":{"room":"lobby","signal":"no_card","since":null,"source":"door_lock"}}',
      ].join("\n"),
    ).lines;
    expect(doorLockSignals(lines).size).toBe(0);
  });
});
