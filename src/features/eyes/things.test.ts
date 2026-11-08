import { describe, expect, it } from "vitest";
import type { SeenThing } from "./sceneSchedule";
import type { Box } from "./smoothBoxes";
import { SCAN_LABEL, thingBoxes, thingOver } from "./things";

const SIZE = { width: 1000, height: 500 };
const thing = (id: string, x: number, y: number, w: number, h: number): SeenThing => ({
  id,
  name: id === "cap" ? "Caps" : "Fjernkontroll",
  category: "other",
  kind: id === "cap" ? "guest" : "room",
  x,
  y,
  w,
  h,
  at: 0,
});
const cap = thing("cap", 0.4, 0.1, 0.1, 0.1);
const remote = thing("remote", 0.6, 0.6, 0.1, 0.1);
const detected = (over: Partial<Box>): Box => ({ id: "d1", x: 0, y: 0, w: 10, h: 10, label: "remote", score: 0.5, ...over });

describe("thingBoxes", () => {
  it("turns scanned things into boxes in video pixels", () => {
    expect(thingBoxes([cap], SIZE, [])).toEqual([
      { id: "cap", x: 400, y: 50, w: 100, h: 50, label: SCAN_LABEL, score: 1 },
    ]);
  });

  it("leaves out a thing the detector already boxed, so one object never gets two boxes", () => {
    const sameRemote = detected({ x: 605, y: 300, w: 100, h: 50 });
    expect(thingBoxes([cap, remote], SIZE, [sameRemote]).map((box) => box.id)).toEqual(["cap"]);
  });

  it("keeps a thing on a person: a big jacket overlaps the person box but is not the person", () => {
    const jacket = thing("jacket", 0.3, 0.2, 0.4, 0.6);
    const person = detected({ label: "person", x: 280, y: 80, w: 440, h: 360 });
    expect(thingBoxes([jacket], SIZE, [person]).map((box) => box.id)).toEqual(["jacket"]);
  });
});

describe("thingOver", () => {
  it("finds the scanned thing on top of a detector box, so the box can borrow its name", () => {
    expect(thingOver(detected({ x: 605, y: 300, w: 100, h: 50 }), [cap, remote], SIZE)?.id).toBe("remote");
  });

  it("finds nothing for a box no thing covers", () => {
    expect(thingOver(detected({ x: 0, y: 400, w: 50, h: 50 }), [cap, remote], SIZE)).toBeUndefined();
  });
});
