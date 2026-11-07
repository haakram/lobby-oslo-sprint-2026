import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUOTA_COPY } from "./requestIdentify";
import { useScene } from "./useScene";

const cropFrame = vi.hoisted(() => vi.fn(() => "data:image/jpeg;base64,AAAA"));
vi.mock("./cropFrame", () => ({ cropFrame }));

const video = { current: { readyState: 2 } as HTMLVideoElement };
const onQuota = vi.fn();
type Options = { on: boolean; paused: boolean; stopped: boolean };

function setup(options: Partial<Options> = {}) {
  const props: Options = { on: true, paused: false, stopped: false, ...options };
  return renderHook((p: Options) => useScene(video, { ...p, onQuota }), { initialProps: props });
}

const ok = () => Response.json({ landmarks: [{ label: "Dør", x: 0.1, y: 0.1, w: 0.2, h: 0.5 }] });
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("useScene", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance", "Date"] });
    fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    cropFrame.mockClear();
    onQuota.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("scans at most every 10 s: three calls in 25 s", async () => {
    const { result } = setup();
    await advance(25_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
    expect(result.current.landmarks.map((l) => l.label)).toEqual(["Dør"]);
  });

  it("never has two scans in flight", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    setup();
    await advance(25_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends nothing while switched off, paused by a sheet, or hidden", async () => {
    const { rerender } = setup({ on: false });
    await advance(25_000);
    rerender({ on: true, paused: true, stopped: false });
    await advance(25_000);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    rerender({ on: true, paused: false, stopped: false });
    await advance(25_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing once the shared quota is spent", async () => {
    setup({ stopped: true });
    await advance(25_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops for good after a 429 and reports the quota", async () => {
    fetchMock.mockImplementation(async () => Response.json({ error: QUOTA_COPY }, { status: 429 }));
    setup();
    await advance(45_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onQuota).toHaveBeenCalledTimes(1);
  });

  it("keeps scanning after a frame could not be cropped", async () => {
    cropFrame.mockImplementationOnce(() => {
      throw new Error("no canvas");
    });
    setup();
    await advance(5_000);
    expect(cropFrame.mock.calls.length).toBeGreaterThan(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
