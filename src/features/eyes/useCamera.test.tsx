import { act, render, screen, waitFor } from "@testing-library/react";
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

/** Shows the status and offers the hook's start, as the Eyes screen does. */
function StatusProbe() {
  const { video, status, start } = useCamera();
  return (
    <>
      <video ref={video} />
      <p data-testid="status">{status}</p>
      <button type="button" onClick={start}>
        start
      </button>
    </>
  );
}

function permission(state: PermissionState) {
  Object.defineProperty(navigator, "permissions", { value: { query: vi.fn(async () => ({ state })) }, configurable: true });
}

describe("useCamera", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "permissions");
  });

  it("waits for a tap when the browser would ask, and asks only then", async () => {
    const camera = fakeCamera();
    permission("prompt");
    render(<StatusProbe />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("idle"));
    expect(camera.getUserMedia).not.toHaveBeenCalled();

    act(() => screen.getByRole("button", { name: "start" }).click());
    expect(screen.getByTestId("status")).toHaveTextContent("starting");
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalled());
  });

  it("says denied straight away when the camera is blocked, without a request that can only fail", async () => {
    const camera = fakeCamera();
    permission("denied");
    render(<StatusProbe />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("denied"));
    expect(camera.getUserMedia).not.toHaveBeenCalled();
  });

  it("starts on its own when the camera is already allowed", async () => {
    const camera = fakeCamera();
    permission("granted");
    render(<StatusProbe />);
    await waitFor(() => expect(camera.getUserMedia).toHaveBeenCalled());
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
