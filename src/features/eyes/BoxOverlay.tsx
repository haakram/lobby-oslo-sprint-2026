"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cx, RegenIcon } from "@/ui";
import { BOX_INK, categoryColor, type BoxCategory } from "./boxCategory";
import { LANDMARK_TTL_MS, type SeenLandmark } from "./sceneSchedule";
import type { Box } from "./smoothBoxes";

/**
 * `object`: a thing we never send (a person); `product`: not checked yet; `busy`: being identified;
 * `missing`: checked, not in the catalogue; `known`: matched in the catalogue. `category` picks the
 * colour of the corners and the tag.
 */
export type BoxLabel = {
  text: string;
  state: "object" | "product" | "busy" | "missing" | "known";
  category: BoxCategory;
};

const FALLBACK: BoxLabel = { text: "Ukjent", state: "object", category: "unknown" };

/**
 * Colour says what kind of thing it is; each state says itself in words (and a tick for a match), so
 * colour is never the only signal (WCAG 1.4.1). The accent stays the robot's and the shutter's.
 */
const TONE: Record<BoxLabel["state"], { word: string | null; spoken: string | null }> = {
  object: { word: null, spoken: null },
  product: { word: "trykk for å sjekke", spoken: "ikke sjekket" },
  busy: { word: null, spoken: null },
  missing: { word: "ikke i katalogen", spoken: "ikke i katalogen" },
  known: { word: null, spoken: "i katalogen" },
};

/**
 * A box covering this share of the frame (or a person's) is tapped on its tag only, so the smaller
 * boxes inside it stay tappable.
 */
export const BIG_BOX_SHARE = 0.25;

function spokenName(label: BoxLabel): string {
  if (label.state === "object") return label.text;
  const spoken = TONE[label.state].spoken;
  return spoken ? `${label.text}, ${spoken}, vis kortet` : `${label.text}, vis kortet`;
}

/** Four corner brackets, like a scanner's viewfinder, instead of a full rectangle. */
const CORNERS = [
  "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-md",
  "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-md",
  "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-md",
  "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-md",
];

// Near the top edge a label would leave the screen, so it moves inside the box.
const tagPlace = (top: number) => (top < 36 ? "top-2 left-2" : "-top-2 left-0 -translate-y-full");

/** The box cut to the video frame: the detector can reach past the edge, most of all for a person. */
function clampToFrame(box: Box, size: { width: number; height: number }) {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  return { x, y, w: Math.max(0, Math.min(size.width, box.x + box.w) - x), h: Math.max(0, Math.min(size.height, box.y + box.h) - y) };
}

/**
 * Boxes biggest first, so the smaller ones paint (and catch taps) on top, with the frame-clamped
 * geometry and whether only the tag takes taps.
 */
export function stackBoxes(boxes: Box[], videoSize: { width: number; height: number }) {
  const frame = videoSize.width * videoSize.height || 1;
  return boxes
    .map((box) => {
      const area = clampToFrame(box, videoSize);
      return { box, area, tagOnly: box.label === "person" || (area.w * area.h) / frame >= BIG_BOX_SHARE };
    })
    .sort((a, b) => b.area.w * b.area.h - a.area.w * a.area.h);
}

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

      {stackBoxes(boxes, videoSize).map(({ box, area, tagOnly }, layer) => {
        const label = labels[box.id] ?? FALLBACK;
        const tone = TONE[label.state];
        // Cut to what is on screen: object-fit: cover crops the video, and a tag off the edge can't be tapped.
        const left = Math.max(0, area.x * scale + offsetX);
        const top = Math.max(0, area.y * scale + offsetY);
        const width = Math.min(view.width, (area.x + area.w) * scale + offsetX) - left;
        const height = Math.min(view.height, (area.y + area.h) * scale + offsetY) - top;
        if (width <= 0 || height <= 0) return null;
        const tag = (
          <span
            aria-hidden="true"
            className={cx(
              "max-w-64 truncate rounded-sm bg-(color:--box) px-2 py-0.5 text-left text-sm font-semibold text-(color:--box-ink) shadow-[0_1px_3px_rgb(0_0_0/0.45)] transition-colors duration-150",
              tagOnly ? "block" : cx("absolute", tagPlace(top)),
            )}
          >
            {label.state === "known" && <RegenIcon name="check" strokeWidth={2.5} className="mr-1 inline size-4 align-[-3px]" />}
            {label.text}
            {tone.word && <span className="font-medium"> · {tone.word}</span>}
          </span>
        );
        return (
          <div
            key={box.id}
            data-category={label.category}
            className="pointer-events-none absolute top-0 left-0 transition-[transform,width,height] duration-150 ease-standard"
            style={
              {
                "--box": categoryColor(label.category),
                "--box-ink": BOX_INK,
                transform: `translate3d(${left}px, ${top}px, 0)`,
                width,
                height,
                zIndex: layer + 1,
              } as CSSProperties
            }
          >
            {CORNERS.map((corner) => (
              <span
                key={corner}
                aria-hidden="true"
                className={cx(
                  "absolute size-6 border-(color:--box) drop-shadow-[0_0_1.5px_rgb(0_0_0/0.8)] transition-colors duration-150",
                  corner,
                  label.state === "busy" && "animate-shimmer",
                )}
              />
            ))}
            <button
              type="button"
              onClick={() => onSelect(box)}
              aria-label={spokenName(label)}
              className={cx(
                "group pointer-events-auto focus-visible:outline-offset-4",
                // A big box (a person, most of the frame) is tapped on its tag, never across its middle.
                tagOnly ? cx("absolute rounded-sm", tagPlace(top)) : "absolute inset-0 rounded-md",
              )}
            >
              {!tagOnly && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-md bg-text opacity-0 transition-opacity duration-150 group-hover:opacity-10 group-active:opacity-15"
                />
              )}
              {tag}
            </button>
          </div>
        );
      })}
    </div>
  );
}
