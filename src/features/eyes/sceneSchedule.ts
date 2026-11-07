import type { Landmark } from "./sceneSchema";

/** One scene scan (one Claude call) at most this often. */
export const SCAN_INTERVAL_MS = 10_000;
/** A landmark fades out and is dropped this long after the scan that found it. */
export const LANDMARK_TTL_MS = 12_000;

export type SceneInput = {
  now: number;
  lastScanAt: number | null;
  inFlight: boolean;
  /** "Omgivelser" is off, the tab is hidden, or a sheet is open. */
  paused: boolean;
  /** The quota ran out (429). */
  stopped: boolean;
};

export type SeenLandmark = Landmark & { id: string; at: number };

export function shouldScan(input: SceneInput): boolean {
  if (input.paused || input.stopped || input.inFlight) return false;
  return input.lastScanAt === null || input.now - input.lastScanAt >= SCAN_INTERVAL_MS;
}

export function freshLandmarks(list: readonly SeenLandmark[], now: number): SeenLandmark[] {
  return list.filter((landmark) => now - landmark.at <= LANDMARK_TTL_MS);
}
