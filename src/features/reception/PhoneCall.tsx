"use client";

import { useEffect, useState } from "react";
import type { Turn, VoicePhase } from "@/features/voice/useFetteroVoice";
import { cx, PhoneIcon } from "@/ui";
import { HOTEL, RECEPTIONIST_NAME } from "./hotel";

const STATUS: Record<VoicePhase, string> = {
  idle: "Trykk på den grønne knappen for å ringe",
  connecting: "Ringer …",
  listening: "Lytter",
  speaking: `${RECEPTIONIST_NAME} snakker`,
};

/** How many of the newest lines the phone shows as live captions. */
const CAPTION_LINES = 2;

function clock(date: Date): string {
  return date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
}

function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Seconds since the call connected, ticking once a second; null while there is no call. */
function useCallSeconds(connected: boolean): number | null {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!connected) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(timer);
      setElapsed(0);
    };
  }, [connected]);
  return connected ? elapsed : null;
}

/** The phone's own clock in the status bar, set on the client only so the server render matches. */
function useClock(): string {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(clock(new Date()));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return time;
}

/**
 * The guest's side of the demo: a phone calling the hotel. Green to call, red to hang up; while the
 * call runs it shows who answers (Maria, the virtual assistant), the call time and the last lines said.
 */
export function PhoneCall({
  phase,
  connected,
  turns,
  onCall,
  onHangUp,
}: {
  phase: VoicePhase;
  connected: boolean;
  turns: Turn[];
  onCall: () => void;
  onHangUp: () => void;
}) {
  const seconds = useCallSeconds(connected);
  const time = useClock();
  const ringing = phase === "connecting";
  const captions = connected ? turns.slice(-CAPTION_LINES) : [];

  return (
    <div
      data-surface="dark"
      className="relative mx-auto flex h-[600px] w-full max-w-[300px] flex-col overflow-hidden rounded-[2.75rem] border-[10px] border-[#0b0d10] bg-bg text-text shadow-2xl"
    >
      {/* Status bar and notch. */}
      <div className="relative flex h-8 shrink-0 items-center justify-between px-6 pt-1 text-xs font-semibold">
        <span className="font-mono tabular-nums">{time}</span>
        <span aria-hidden="true" className="absolute top-1.5 left-1/2 h-5 w-24 -translate-x-1/2 rounded-full bg-[#0b0d10]" />
        <span aria-hidden="true" className="tracking-[0.2em]">
          ●●●
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center px-5 pt-10 pb-8 text-center">
        <div className="relative grid size-24 place-items-center">
          {phase === "speaking" && (
            <span aria-hidden="true" className="absolute inset-0 rounded-full bg-accent/40 motion-safe:animate-ping" />
          )}
          {ringing && (
            <span aria-hidden="true" className="absolute inset-0 rounded-full bg-success/30 motion-safe:animate-pulse" />
          )}
          <span
            aria-hidden="true"
            className={cx(
              "relative grid size-24 place-items-center rounded-full border-2 text-4xl font-bold",
              connected ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-sunken text-text",
            )}
          >
            {connected ? RECEPTIONIST_NAME.charAt(0) : HOTEL.name.charAt(0)}
          </span>
        </div>

        <h2 className="mt-5 text-3xl font-bold tracking-[-0.02em]">{HOTEL.name}</h2>
        <p className="mt-1 text-sm text-muted">
          {connected ? `${RECEPTIONIST_NAME} · virtuell assistent (KI)` : `Hotell · ${HOTEL.city}`}
        </p>
        {connected && (
          <p className="mt-2 rounded-full bg-sunken px-3 py-1 text-xs text-muted">
            Skrives ned · ingen lydopptak · slettes etter {HOTEL.privacy.retentionDays} dager
          </p>
        )}
        <p aria-live="polite" className="mt-3 min-h-6 text-base font-medium">
          {seconds !== null ? (
            <>
              <span className="font-mono tabular-nums">{duration(seconds)}</span>
              <span className="text-muted"> · {STATUS[phase]}</span>
            </>
          ) : (
            STATUS[phase]
          )}
        </p>

        {/* Live captions: the last lines said, so the room can follow the call. */}
        <ol aria-label="Siste i samtalen" className="mt-6 flex w-full flex-1 flex-col justify-end gap-2 overflow-hidden">
          {captions.map((turn) => (
            <li
              key={turn.id}
              className={cx(
                "max-w-[90%] rounded-2xl px-3 py-2 text-left text-sm leading-snug",
                turn.role === "user" ? "self-end bg-accent text-on-accent" : "self-start bg-sunken text-text",
              )}
            >
              <span className="line-clamp-4">{turn.text}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col items-center gap-2">
          {connected ? (
            <button
              type="button"
              onClick={onHangUp}
              aria-label={`Legg på samtalen med ${HOTEL.name}`}
              className="grid size-16 place-items-center rounded-full bg-danger text-white transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus active:scale-95"
            >
              <PhoneIcon className="size-7 rotate-[135deg]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onCall}
              disabled={ringing}
              aria-label={`Ring ${HOTEL.name}`}
              className="grid size-16 place-items-center rounded-full bg-success text-white transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus active:scale-95 disabled:opacity-60"
            >
              <PhoneIcon className="size-7" />
            </button>
          )}
          <span className="text-xs text-muted">{connected ? "Legg på" : ringing ? "Ringer" : "Ring"}</span>
        </div>
      </div>
    </div>
  );
}
