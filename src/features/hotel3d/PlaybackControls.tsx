"use client";

import { type HotelReplay, simToClock, type Speed, SPEEDS } from "@/features/replay";
import { Badge, Button, cx, RegenIcon } from "@/ui";

/**
 * Play/pause, speed and the scrubber over the night. One primary action (play or pause); the speed
 * and the timeline are secondary. Works for the finished demo and for a live shift.
 */
export function PlaybackControls({ replay, compact = false, className }: { replay: HotelReplay; compact?: boolean; className?: string }) {
  const ready = replay.status === "ready" && replay.duration > 0;
  const atEnd = replay.t >= replay.duration - 0.5;
  const ticks = tickMarks(replay.duration);
  const label = replay.playing ? "Pause" : atEnd && !replay.live ? "Spill av fra 22:00" : "Spill av";

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        {/* No aria-pressed: the label itself flips (Spill av / Pause), so it would be announced twice. */}
        <Button size={compact ? "md" : "lg"} onClick={replay.toggle} disabled={!ready}>
          <RegenIcon name={replay.playing ? "pause" : "play"} className="size-5" />
          {label}
        </Button>
        <span className={cx("font-mono font-medium tabular-nums whitespace-nowrap", compact ? "text-lg" : "text-xl")}>
          <span className="sr-only">Klokke i natt: </span>
          {ready ? simToClock(replay.t, false) : "--:--"}
        </span>
        {replay.live && (
          <button
            type="button"
            aria-pressed={replay.followLive}
            onClick={() => {
              replay.pause();
              replay.setFollowLive(true);
              replay.setT(replay.duration);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold transition-colors duration-150 ease-standard hover:bg-sunken pointer-coarse:min-h-11"
          >
            <span aria-hidden="true" className={cx("size-2 rounded-full", replay.followLive ? "bg-danger" : "bg-line-strong")} />
            {replay.followLive ? "Følger direkte" : "Gå til nå"}
          </button>
        )}
        <div role="group" aria-label="Fart" className="ml-auto inline-flex gap-0.5 rounded-md border border-line bg-surface p-0.5">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              aria-pressed={replay.speed === speed}
              onClick={() => replay.setSpeed(speed as Speed)}
              className={cx(
                "min-h-10 rounded-sm px-2.5 font-mono text-sm tabular-nums transition-colors duration-150 ease-standard pointer-coarse:min-h-11",
                replay.speed === speed ? "bg-sunken text-text" : "text-muted hover:text-text",
              )}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      <div>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(replay.duration))}
          step={1}
          value={Math.round(replay.t)}
          disabled={!ready}
          aria-label="Tidspunkt på natten"
          aria-valuetext={simToClock(replay.t)}
          onChange={(event) => replay.setT(Number(event.currentTarget.value))}
          className="block h-11 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
        />
        <div className="relative h-5 text-sm text-muted sm:text-xs" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick.t}
              className="absolute top-0 -translate-x-1/2 font-mono tabular-nums first:translate-x-0 last:-translate-x-full"
              style={{ left: `${(tick.t / Math.max(1, replay.duration)) * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      {!ready && replay.status === "ready" && <Badge tone="neutral">Ingen tid registrert ennå</Badge>}
    </div>
  );
}

/** A mark every two hours, from 22:00 to the end of the recording. */
function tickMarks(duration: number): Array<{ t: number; label: string }> {
  if (duration <= 0) return [{ t: 0, label: "22:00" }];
  const step = duration > 4 * 3600 ? 2 * 3600 : duration > 3600 ? 3600 : 900;
  const marks: Array<{ t: number; label: string }> = [];
  for (let t = 0; t <= duration; t += step) marks.push({ t, label: simToClock(t, false) });
  if (duration - (marks.at(-1)?.t ?? 0) > step / 2) marks.push({ t: duration, label: simToClock(duration, false) });
  return marks;
}
