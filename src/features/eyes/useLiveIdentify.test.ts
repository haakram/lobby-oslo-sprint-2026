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
  return renderHook(() => useLiveIdentify(video, [], { auto: true, paused: false, stopped: false, people: true, onQuota }));
}

describe("useLiveIdentify", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("remembers a result for the box, so its label can update live", async () => {
    const result = { sku: "FT-1001", name: "Sjampo 250 ml", category: "hygiene", kind: "supply", summary: "", seen: [], textSeen: [], confidence: "high" };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(result)));
    const { result: hook } = setup();
    await act(() => hook.current.send("data:image/jpeg;base64,AAAA", box));
    expect(hook.current.results["box-1"]?.product?.name).toBe("Sjampo 250 ml");
    expect(hook.current.busy["box-1"]).toBeUndefined();
  });

  it("hides an answer that looked at people once people are switched off, and asks without them after", async () => {
    const result = { sku: null, name: "Person", category: "other", kind: "person", summary: "En person med caps.", seen: [], textSeen: [], confidence: "high" };
    const fetchMock = vi.fn(async () => Response.json(result));
    vi.stubGlobal("fetch", fetchMock);
    const { result: hook, rerender } = renderHook(
      ({ people }: { people: boolean }) => useLiveIdentify(video, [], { auto: true, paused: false, stopped: false, people, onQuota }),
      { initialProps: { people: true } },
    );
    await act(() => hook.current.send("data:image/jpeg;base64,AAAA", box));
    expect(hook.current.results["box-1"]?.summary).toBe("En person med caps.");
    rerender({ people: false });
    expect(hook.current.results["box-1"]).toBeUndefined();
    await act(() => hook.current.send("data:image/jpeg;base64,AAAA", box));
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ people: false });
    // Asked without people: shown while people stay off.
    expect(hook.current.results["box-1"]).toBeDefined();
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
