import { describe, expect, it, vi } from "vitest";
import { blockMediaPipeTelemetry } from "./noTelemetry";

function host() {
  const real = vi.fn(async () => new Response("ok", { status: 200 }));
  return { real, target: { fetch: real as unknown as typeof fetch } };
}

describe("blockMediaPipeTelemetry", () => {
  it("answers MediaPipe's usage log on the device: the request never reaches the network", async () => {
    const { real, target } = host();
    blockMediaPipeTelemetry(target);
    const response = await target.fetch("https://odml.pa.googleapis.com/v1/log", { method: "POST", body: "x" });
    expect(response.status).toBe(204);
    expect((await target.fetch(new URL("https://odml.pa.googleapis.com/v1/log"))).status).toBe(204);
    expect(real).not.toHaveBeenCalled();
  });

  it("passes every other request through unchanged, our own API included", async () => {
    const { real, target } = host();
    blockMediaPipeTelemetry(target);
    await target.fetch("/api/identify", { method: "POST" });
    await target.fetch("https://api.elevenlabs.io/v1/x");
    await target.fetch("https://odml.pa.googleapis.com.evil.example/v1/log");
    expect(real).toHaveBeenCalledTimes(3);
    expect(real).toHaveBeenNthCalledWith(1, "/api/identify", { method: "POST" });
  });

  it("wraps only once, however often a detector is created", async () => {
    const { real, target } = host();
    blockMediaPipeTelemetry(target);
    const once = target.fetch;
    blockMediaPipeTelemetry(target);
    expect(target.fetch).toBe(once);
    await target.fetch("/x");
    expect(real).toHaveBeenCalledTimes(1);
  });
});
