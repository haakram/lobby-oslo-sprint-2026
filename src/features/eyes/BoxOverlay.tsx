"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/ui";
import { LANDMARK_TTL_MS, type SeenLandmark } from "./sceneSchedule";
import type { Box } from "./smoothBoxes";

/**
 * `object`: a thing we never send (person, chair); `product`: product-like, not matched (yet);
 * `busy`: being identified; `known`: matched in the catalogue.
 */
export type BoxLabel = { text: string; state: "object" | "product" | "busy" | "known" };

const FALLBACK: BoxLabel = { text: "Gjenstand", state: "object" };

const TONE: Record<BoxLabel["state"], { corner: string; tag: string }> = {
  object: { corner: "border-muted", tag: "bg-sunken text-text" },
  product: { corner: "border-accent", tag: "bg-accent text-on-accent" },
  busy: { corner: "border-accent", tag: "bg-accent text-on-accent" },
  known: { corner: "border-success", tag: "bg-success text-bg" },
};

/** Four corner brackets, like a scanner's viewfinder, instead of a full rectangle. */
const CORNERS = [
  "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-md",
  "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-md",
  "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-md",
  "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-md",
];

// Near the top edge a label would leave the screen, so it moves inside the box.
const tagPlace = (top: number) => (top < 36 ? "top-2 left-2" : "-top-2 left-0 -translate-y-full");

/**
 * Tappable boxes, plus dashed landmark boxes, over a video drawn with `object-fit: cover`. Boxes come
 * in video pixels, landmarks normalised 0–1; both are mapped onto the visible, cropped video.
 */
export function BoxOverlay({
  boxes,
  landmarks,
  now,
  videoSize,
  labels,
  onSelect,
}: {
  boxes: Box[];
  landmarks: SeenLandmark[];
  /** Clock for fading landmarks (performance.now() of the last tick). */
  now: number;
  videoSize: { width: number; height: number };
  labels: Record<string, BoxLabel>;
  onSelect: (box: Box) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setView({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = Math.max(view.width / videoSize.width, view.height / videoSize.height) || 0;
  const offsetX = (view.width - videoSize.width * scale) / 2;
  const offsetY = (view.height - videoSize.height * scale) / 2;
  if (scale <= 0) return <div ref={container} className="absolute inset-0 overflow-hidden" />;

  return (
    <div ref={container} className="absolute inset-0 overflow-hidden">
      {landmarks.map((mark) => {
        const left = mark.x * videoSize.width * scale + offsetX;
        const top = mark.y * videoSize.height * scale + offsetY;
        const fade = Math.min(1, Math.max(0, 1 - (now - mark.at) / LANDMARK_TTL_MS));
        return (
          <div
            key={mark.id}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 rounded-md border-2 border-dashed border-text transition-opacity duration-300 ease-standard"
            style={{
              transform: `translate3d(${left}px, ${top}px, 0)`,
              width: mark.w * videoSize.width * scale,
              height: mark.h * videoSize.height * scale,
              opacity: 0.35 + 0.65 * fade,
            }}
          >
            <span
              className={cx(
                "absolute rounded-sm border border-line bg-surface px-2 py-0.5 text-sm font-semibold text-text",
                tagPlace(top),
              )}
            >
              {mark.label}
            </span>
          </div>
        );
      })}

      {boxes.map((box) => {
        const label = labels[box.id] ?? FALLBACK;
        const tone = TONE[label.state];
        const left = box.x * scale + offsetX;
        const top = box.y * scale + offsetY;
        return (
          <button
            key={box.id}
            type="button"
            onClick={() => onSelect(box)}
            aria-label={label.state === "object" ? label.text : `${label.text}, vis kortet`}
            className="group absolute top-0 left-0 rounded-md transition-[transform,width,height] duration-150 ease-standard focus-visible:outline-offset-4"
            style={{
              transform: `translate3d(${left}px, ${top}px, 0)`,
              width: box.w * scale,
              height: box.h * scale,
            }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-md bg-text opacity-0 transition-opacity duration-150 group-hover:opacity-10 group-active:opacity-15"
            />
            {CORNERS.map((corner) => (
              <span
                key={corner}
                aria-hidden="true"
                className={cx(
                  "absolute size-6 transition-colors duration-150",
                  tone.corner,
                  corner,
                  label.state === "busy" && "animate-shimmer",
                )}
              />
            ))}
            <span
              aria-hidden="true"
              className={cx(
                "absolute max-w-64 truncate rounded-sm px-2 py-0.5 text-left text-sm font-semibold transition-colors duration-150",
                tagPlace(top),
                tone.tag,
              )}
            >
              {label.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}
