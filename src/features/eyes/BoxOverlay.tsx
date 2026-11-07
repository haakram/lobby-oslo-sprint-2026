"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/ui";
import type { Box } from "./smoothBoxes";

export type BoxLabel = { text: string; state: "unknown" | "busy" | "known" };

const UNKNOWN: BoxLabel = { text: "Ukjent produkt · trykk", state: "unknown" };

/** Four corner brackets, like a scanner's viewfinder, instead of a full rectangle. */
const CORNERS = [
  "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-md",
  "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-md",
  "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-md",
  "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-md",
];

/**
 * Tappable boxes over a video drawn with `object-fit: cover`. Boxes come in video pixels and are
 * mapped onto the visible, cropped area of the video.
 */
export function BoxOverlay({
  boxes,
  videoSize,
  labels,
  onSelect,
}: {
  boxes: Box[];
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

  return (
    <div ref={container} className="absolute inset-0 overflow-hidden">
      {scale > 0 &&
        boxes.map((box) => {
          const label = labels[box.id] ?? UNKNOWN;
          const left = box.x * scale + offsetX;
          const top = box.y * scale + offsetY;
          const tone = label.state === "known" ? "border-success" : "border-accent";
          // Near the top edge the label would leave the screen, so it moves inside the box.
          const labelInside = top < 36;
          return (
            <button
              key={box.id}
              type="button"
              onClick={() => onSelect(box)}
              aria-label={label.state === "known" ? `${label.text}, identifiser på nytt` : "Identifiser denne varen"}
              className="group absolute top-0 left-0 rounded-md transition-[transform,width,height] duration-150 ease-standard focus-visible:outline-offset-4"
              style={{
                transform: `translate3d(${left}px, ${top}px, 0)`,
                width: box.w * scale,
                height: box.h * scale,
              }}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-md bg-accent opacity-0 transition-opacity duration-150 group-hover:opacity-10 group-active:opacity-15"
              />
              {CORNERS.map((corner) => (
                <span
                  key={corner}
                  aria-hidden="true"
                  className={cx(
                    "absolute size-6 transition-colors duration-150",
                    tone,
                    corner,
                    label.state === "busy" && "animate-shimmer",
                  )}
                />
              ))}
              <span
                aria-hidden="true"
                className={cx(
                  "absolute max-w-64 truncate rounded-sm px-2 py-0.5 text-left text-sm font-semibold",
                  labelInside ? "top-2 left-2" : "-top-2 left-0 -translate-y-full",
                  label.state === "known" ? "bg-success text-bg" : "bg-accent text-on-accent",
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
