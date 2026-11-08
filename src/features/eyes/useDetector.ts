"use client";

import type { ObjectDetector } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState, type RefObject } from "react";
import { COVER_SCORE, DETECTOR_MAX_RESULTS, splitDetections, toBoxes } from "./detections";
import { blockMediaPipeTelemetry } from "./noTelemetry";
import { smoothBoxes, type Box } from "./smoothBoxes";

/**
 * `ready` only once the detector has looked at the video: until then, and after it has `failed`, nobody in
 * view can be covered, so Øyne sends no image at all (fail closed).
 */
export type DetectorStatus = "loading" | "ready" | "failed";

// Served from public/ so the demo never depends on a CDN (public/models/README.md).
const WASM_BASE = "/mediapipe";
const MODEL = "/models/efficientdet_lite0.tflite";

async function createDetector(delegate: "GPU" | "CPU"): Promise<ObjectDetector> {
  // MediaPipe's usage log to Google is answered on the phone and never sent (noTelemetry.ts).
  blockMediaPipeTelemetry();
  const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  return ObjectDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: "VIDEO",
    // Every detection down to the cover's bar; the screen's own bar and cap are applied in splitDetections.
    scoreThreshold: COVER_SCORE,
    maxResults: DETECTOR_MAX_RESULTS,
  });
}

/**
 * Runs MediaPipe's object detector on every new video frame while `active`. Returns the boxes to draw,
 * eased into stable, smoothed boxes (video pixels), and `people`: every person in the latest frames, however
 * many and however faint the screen would draw them, to paint over before an image is sent.
 */
export function useDetector(video: RefObject<HTMLVideoElement | null>, active: boolean) {
  const [detector, setDetector] = useState<ObjectDetector | null>(null);
  const [failed, setFailed] = useState(false);
  // Set after the first frame the detector has read: only then are the people in view known.
  const [looked, setLooked] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [people, setPeople] = useState<Box[]>([]);
  // Survive a pause (sheet open), so box ids and their labels carry on afterwards.
  const tracked = useRef<Box[]>([]);
  const trackedPeople = useRef<Box[]>([]);
  const lookedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let created: ObjectDetector | null = null;
    // The GPU delegate is faster but missing on some phones; the CPU one always works.
    createDetector("GPU")
      .catch(() => createDetector("CPU"))
      .then((instance) => {
        created = instance;
        if (cancelled) return instance.close();
        setDetector(instance);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      created?.close();
    };
  }, []);

  useEffect(() => {
    if (!detector || !active || failed) return;
    let frame = 0;
    let lastTime = -1;

    const tick = () => {
      const element = video.current;
      if (element && element.readyState >= 2 && element.currentTime !== lastTime) {
        lastTime = element.currentTime;
        let result: ReturnType<ObjectDetector["detectForVideo"]>;
        try {
          result = detector.detectForVideo(element, performance.now());
        } catch {
          // A lost GPU context ends live boxes and the cover with them: Øyne then sends nothing.
          // Clear the boxes too, so no stale box stays tappable.
          tracked.current = [];
          trackedPeople.current = [];
          setBoxes([]);
          setPeople([]);
          setFailed(true);
          return;
        }
        const { shown, people: found } = splitDetections(toBoxes(result.detections));
        tracked.current = smoothBoxes(tracked.current, shown);
        // Snapped to this frame (alpha 1), not eased: the cover sits where the person is now, and a person
        // the model misses for a frame or two stays covered at the last place seen.
        trackedPeople.current = smoothBoxes(trackedPeople.current, found, 1);
        setBoxes(tracked.current);
        setPeople(trackedPeople.current);
        if (!lookedOnce.current) {
          lookedOnce.current = true;
          setLooked(true);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [detector, active, failed, video]);

  const status: DetectorStatus = failed ? "failed" : detector && looked ? "ready" : "loading";
  return { boxes, people, status };
}
