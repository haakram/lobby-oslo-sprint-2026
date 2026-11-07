"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraProblem = "denied" | "notfound" | "insecure" | "error";
export type CameraStatus = "starting" | "ready" | CameraProblem;

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

async function openStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(REAR);
  } catch (error) {
    // A denial stays a denial; anything else gets one more try with any camera at all.
    if (problemOf(error) === "denied") throw error;
    return navigator.mediaDevices.getUserMedia(ANY);
  }
}

/** Streams the rear camera (any camera if there is none) into the returned `video` ref. */
export function useCamera() {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      if (!window.isSecureContext) return setStatus("insecure");
      if (!navigator.mediaDevices?.getUserMedia) return setStatus("error");
      try {
        stream = await openStream();
        const element = video.current;
        if (cancelled || !element) return;
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
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus("starting");
    setAttempt((n) => n + 1);
  }, []);

  return { video, status, size, retry };
}
