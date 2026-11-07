import { render, waitFor } from "@testing-library/react";
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

/** Attaches the hook's ref to a real <video>, as the Eyes screen does. */
function Probe() {
  const { video } = useCamera();
  return <video ref={video} data-testid="video" />;
}

describe("useCamera", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops a stream that arrives after the screen has gone", async () => {
    const camera = fakeCamera();
    const { getByTestId, unmount } = render(<Probe />);
    expect(getByTestId("video")).toBeInstanceOf(HTMLVideoElement);
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalled());

    unmount();
    camera.resolve(camera.stream);

    await waitFor(() => expect(camera.track.stop).toHaveBeenCalled());
  });
});
