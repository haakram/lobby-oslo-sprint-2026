"use client";

import type { ObjectDetector } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState, type RefObject } from "react";
import { smoothBoxes, type Box } from "./smoothBoxes";

export type DetectorStatus = "loading" | "ready" | "failed";

// Served from public/ so the demo never depends on a CDN (public/models/README.md).
const WASM_BASE = "/mediapipe";
const MODEL = "/models/efficientdet_lite0.tflite";

async function createDetector(delegate: "GPU" | "CPU"): Promise<ObjectDetector> {
  const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  return ObjectDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: "VIDEO",
    scoreThreshold: 0.4,
    maxResults: 5,
  });
}

/**
 * Runs MediaPipe's object detector on every new video frame while `active`, and returns the
 * detections eased into stable, smoothed boxes (video pixels).
 */
export function useDetector(video: RefObject<HTMLVideoElement | null>, active: boolean) {
  const [detector, setDetector] = useState<ObjectDetector | null>(null);
  const [status, setStatus] = useState<DetectorStatus>("loading");
  const [boxes, setBoxes] = useState<Box[]>([]);
  // Survives a pause (sheet open), so box ids and their labels carry on afterwards.
  const tracked = useRef<Box[]>([]);

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
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      created?.close();
    };
  }, []);

  useEffect(() => {
    if (!detector || !active) return;
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
          // A lost GPU context ends live boxes; the shutter still identifies the whole frame.
          // Clear the boxes too, so no stale box stays tappable.
          tracked.current = [];
          setBoxes([]);
          setStatus("failed");
          return;
        }
        const found: Box[] = result.detections.flatMap((detection) => {
          const box = detection.boundingBox;
          if (!box) return [];
          const top = detection.categories[0];
          return [
            {
              id: "",
              x: box.originX,
              y: box.originY,
              w: box.width,
              h: box.height,
              label: top?.categoryName ?? "",
              score: top?.score ?? 0,
            },
          ];
        });
        tracked.current = smoothBoxes(tracked.current, found);
        setBoxes(tracked.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [detector, active, video]);

  return { boxes, status };
}
