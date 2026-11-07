import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCamera } from "./useCamera";

function fakeCamera() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  let resolve: (value: MediaStream) => void = () => {};
  const getUserMedia = vi.fn(() => new Promise<MediaStream>((r) => (resolve = r)));
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  return { track, stream, getUserMedia, resolve: (s: MediaStream) => resolve(s) };
}

describe("useCamera", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops a stream that arrives after the screen has gone", async () => {
    const camera = fakeCamera();
    const { unmount } = renderHook(() => useCamera());
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalled());

    unmount();
    camera.resolve(camera.stream);

    await waitFor(() => expect(camera.track.stop).toHaveBeenCalled());
  });
});
