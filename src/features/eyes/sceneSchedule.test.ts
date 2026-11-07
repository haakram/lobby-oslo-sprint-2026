import { describe, expect, it } from "vitest";
import { LANDMARK_TTL_MS, SCAN_INTERVAL_MS, freshLandmarks, shouldScan, type SceneInput } from "./sceneSchedule";

const NOW = 50_000;
const input = (over: Partial<SceneInput> = {}): SceneInput => ({
  now: NOW,
  lastScanAt: null,
  inFlight: false,
  paused: false,
  stopped: false,
  ...over,
});

describe("shouldScan", () => {
  it("scans straight away the first time", () => {
    expect(shouldScan(input())).toBe(true);
  });

  it("leaves 10 s between scans", () => {
    expect(SCAN_INTERVAL_MS).toBe(10_000);
    expect(shouldScan(input({ lastScanAt: NOW - SCAN_INTERVAL_MS + 1 }))).toBe(false);
    expect(shouldScan(input({ lastScanAt: NOW - SCAN_INTERVAL_MS }))).toBe(true);
  });

  it("waits while a scan is in flight", () => {
    expect(shouldScan(input({ inFlight: true }))).toBe(false);
  });

  it("does nothing while paused (switch off, tab hidden or sheet open)", () => {
    expect(shouldScan(input({ paused: true }))).toBe(false);
  });

  it("stops after the quota ran out", () => {
    expect(shouldScan(input({ stopped: true }))).toBe(false);
  });
});

describe("freshLandmarks", () => {
  it("drops landmarks older than 12 s", () => {
    expect(LANDMARK_TTL_MS).toBe(12_000);
    const seen = (at: number) => ({ id: String(at), label: "Dør" as const, x: 0, y: 0, w: 0.1, h: 0.1, at });
    const list = [seen(NOW - LANDMARK_TTL_MS - 1), seen(NOW - LANDMARK_TTL_MS), seen(NOW)];
    expect(freshLandmarks(list, NOW).map((l) => l.at)).toEqual([NOW - LANDMARK_TTL_MS, NOW]);
  });
});
