import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QUOTA_COPY } from "./requestIdentify";
import type { Box } from "./smoothBoxes";
import { useLiveIdentify } from "./useLiveIdentify";

// What a live crop would send, without a canvas (jsdom has none).
const crops = vi.hoisted(() => [] as { box: unknown; cover: readonly unknown[] | undefined }[]);
vi.mock("./cropFrame", async (importActual) => ({
  ...(await importActual<typeof import("./cropFrame")>()),
  cropFrame: (_video: unknown, box: unknown, _maxSide?: number, cover?: readonly unknown[]) => {
    crops.push({ box, cover });
    return "data:image/jpeg;base64,AAAA";
  },
}));

const box: Box = { id: "box-1", x: 0, y: 0, w: 100, h: 100, label: "bottle", score: 0.9 };
const video = { current: null };

const onQuota = vi.fn();

function setup() {
  onQuota.mockClear();
  return renderHook(() => useLiveIdentify(video, [], { auto: true, paused: false, stopped: false, onQuota }));
}

describe("useLiveIdentify", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("remembers a result for the box, so its label can update live", async () => {
    const result = { sku: "FT-1001", name: "Sjampo 250 ml", category: "hygiene", textSeen: [], confidence: "high" };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(result)));
    const { result: hook } = setup();
    await act(() => hook.current.send("data:image/jpeg;base64,AAAA", box));
    expect(hook.current.results["box-1"]?.product?.name).toBe("Sjampo 250 ml");
    expect(hook.current.busy["box-1"]).toBeUndefined();
  });

  it("reports the shared quota after a 429 and keeps the server's copy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: QUOTA_COPY }, { status: 429 })));
    const { result: hook } = setup();
    await act(async () => {
      await expect(hook.current.send("data:image/jpeg;base64,AAAA", box)).rejects.toMatchObject({
        title: QUOTA_COPY,
        quota: true,
      });
    });
    expect(onQuota).toHaveBeenCalledTimes(1);
  });

  describe("live recognition with the detector's full list of people", () => {
    const bottle: Box = { id: "box-9", x: 300, y: 100, w: 60, h: 150, label: "bottle", score: 0.9 };
    // A person the screen does not draw (beyond its five boxes), right beside the bottle.
    const unseen: Box = { id: "p-9", x: 330, y: 0, w: 200, h: 400, label: "person", score: 0.35 };
    const liveVideo = { current: {} as HTMLVideoElement };

    afterEach(() => {
      vi.useRealTimers();
      crops.length = 0;
    });

    const run = (cover?: () => readonly Box[]) => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance", "Date"] });
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ sku: null, name: "Flaske", category: "other", textSeen: [], confidence: "low" })));
      renderHook(() => useLiveIdentify(liveVideo, [bottle], { auto: true, paused: false, stopped: false, onQuota, cover }));
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    };

    it("leaves a product beside a person it cannot draw to a tap", () => {
      run(() => [unseen]);
      expect(crops).toEqual([]);
    });

    it("recognises the same product on its own when nobody is near", () => {
      run(() => []);
      expect(crops).toEqual([{ box: bottle, cover: [] }]);
    });
  });
});
