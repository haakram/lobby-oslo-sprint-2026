import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QUOTA_COPY } from "./requestIdentify";
import type { Box } from "./smoothBoxes";
import { useLiveIdentify } from "./useLiveIdentify";

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
});
