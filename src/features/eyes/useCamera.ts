"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraProblem = "denied" | "notfound" | "insecure" | "error";
/** `idle`: the browser would ask for the camera, so the screen waits for a tap (a prompt answers a gesture). */
export type CameraStatus = "idle" | "starting" | "ready" | CameraProblem;

const REAR: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
};
const ANY: MediaStreamConstraints = { audio: false, video: true };

function problemOf(error: unknown): CameraProblem {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "notfound";
  return "error";
}

/** What the browser would do if asked now; "unknown" where the Permissions API has no "camera" (Firefox, older Safari). */
async function cameraPermission(): Promise<PermissionState | "unknown"> {
  try {
    const permission = await navigator.permissions?.query({ name: "camera" as PermissionName });
    return permission?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function openStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(REAR);
  } catch (error) {
    // A denial stays a denial; anything else gets one more try with any camera at all.
    if (problemOf(error) === "denied") throw error;
    return navigator.mediaDevices.getUserMedia(ANY);
  }
}

/**
 * Streams the rear camera (any camera if there is none) into the returned `video` ref. Already allowed:
 * it starts on its own. Not yet asked: `idle` until `start()` (a tap), so the screen opens calm instead of
 * on a browser prompt. Blocked: `denied` straight away, without a request that can only fail.
 */
export function useCamera() {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // The <video> stays mounted for the screen's whole life, so the element read here is the one to clean.
    const element = video.current;
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      if (!window.isSecureContext) return setStatus("insecure");
      if (!navigator.mediaDevices?.getUserMedia) return setStatus("error");
      // The first run only looks; every later run (start or retry, both a tap) asks the browser.
      if (attempt === 0) {
        const permission = await cameraPermission();
        if (cancelled) return;
        if (permission === "prompt") return setStatus("idle");
        if (permission === "denied") return setStatus("denied");
      }
      try {
        const opened = await openStream();
        // Cleaned up while the browser was still asking (StrictMode, navigating away, Retry):
        // stop the late stream, or the camera light stays on.
        if (cancelled || !element) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;
        element.srcObject = stream;
        await new Promise<void>((resolve) => {
          if (element.readyState >= 1) resolve();
          else element.addEventListener("loadedmetadata", () => resolve(), { once: true });
        });
        await element.play();
        if (cancelled) return;
        setSize({ width: element.videoWidth, height: element.videoHeight });
        setStatus("ready");
      } catch (error) {
        if (!cancelled) setStatus(problemOf(error));
      }
    }

    void start();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (element) element.srcObject = null;
    };
  }, [attempt]);

  /** Asks the browser for the camera: the first start after `idle`, and every retry. */
  const start = useCallback(() => {
    setStatus("starting");
    setAttempt((n) => n + 1);
  }, []);

  return { video, status, size, start, retry: start };
}
