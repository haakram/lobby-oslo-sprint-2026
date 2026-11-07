"use client";

import { useConversation, useConversationClientTool, type MessagePayload } from "@elevenlabs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectLanguage, type LanguageCode } from "@/features/voice/language";
import type { Turn, VoicePhase, VoiceProblem } from "@/features/voice/useFetteroVoice";
import { createCallSink, type ReceptionRecord, type ReceptionSink } from "./records";
import { createReceptionTools } from "./tools";

const MAX_TURNS = 40;

/** Asks for the microphone before any token is spent, so a denial gets its own screen. */
async function checkMicrophone(): Promise<VoiceProblem | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return { kind: "no-mic" };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return { kind: "mic-denied" };
    return { kind: "no-mic" };
  }
}

async function fetchToken(): Promise<{ token: string } | VoiceProblem> {
  try {
    const response = await fetch("/api/reception/token", { cache: "no-store" });
    if (response.status === 503) return { kind: "not-set-up" };
    if (!response.ok) return { kind: "connection" };
    const body: unknown = await response.json();
    if (typeof body === "object" && body && "token" in body && typeof body.token === "string") {
      return { token: body.token };
    }
    return { kind: "connection" };
  } catch {
    return { kind: "connection" };
  }
}

/**
 * The receptionist in the browser: microphone check, server token, ElevenLabs WebRTC session,
 * transcript and the four reception tools. Every booking or message the agent records goes to
 * `onRecord`; a fresh sink per call drops repeats and caps the count. Use inside `ConversationProvider`.
 */
export function useReceptionVoice(onRecord: (record: ReceptionRecord) => void) {
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<VoiceProblem | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [language, setLanguage] = useState<LanguageCode | null>(null);
  // Set when staff hang up, so a normal hang-up is not shown as a dropped line.
  const endedByUser = useRef(false);

  // The latest onRecord, so the tools never hold a stale screen callback.
  const onRecordRef = useRef(onRecord);
  useEffect(() => {
    onRecordRef.current = onRecord;
  }, [onRecord]);

  const sink = useRef<ReceptionSink | null>(null);
  const newSink = useCallback(() => createCallSink((record) => onRecordRef.current(record)), []);
  // Today in Oslo and the demo occupancy come from the tools' defaults.
  const tools = useMemo(
    () => createReceptionTools({ sink: { record: (item) => (sink.current ??= newSink()).record(item) } }),
    [newSink],
  );
  useConversationClientTool("get_room_price", tools.get_room_price);
  useConversationClientTool("check_availability", tools.check_availability);
  useConversationClientTool("record_booking_request", tools.record_booking_request);
  useConversationClientTool("record_message", tools.record_message);

  const onMessage = useCallback(({ message, role, event_id, response_id }: MessagePayload) => {
    const text = message.trim();
    if (!text) return;
    const detected = role === "user" ? detectLanguage(text) : null;
    if (detected) setLanguage(detected);
    const id = role === "agent" && response_id ? `agent-${response_id}` : `${role}-${event_id}`;
    setTurns((current) => {
      const turn: Turn = { id, role, text, language: detected };
      const existing = current.findIndex((t) => t.id === id);
      if (existing >= 0) return current.map((t, i) => (i === existing ? turn : t));
      return [...current, turn].slice(-MAX_TURNS);
    });
  }, []);

  const conversation = useConversation({
    onMessage,
    onConnect: () => setPreparing(false),
    onError: () => {
      setPreparing(false);
      setProblem({ kind: "connection" });
    },
    onDisconnect: (details) => {
      setPreparing(false);
      if (!endedByUser.current && details.reason === "error") setProblem({ kind: "connection" });
    },
  });

  const { startSession, endSession, status, isSpeaking, getInputVolume, getOutputVolume } = conversation;

  const start = useCallback(async () => {
    setProblem(null);
    setPreparing(true);
    endedByUser.current = false;
    const mic = await checkMicrophone();
    if (mic) {
      setPreparing(false);
      setProblem(mic);
      return;
    }
    const result = await fetchToken();
    if ("kind" in result) {
      setPreparing(false);
      setProblem(result);
      return;
    }
    setTurns([]);
    setLanguage(null);
    // A new call: its own record of what was already taken down.
    sink.current = newSink();
    startSession({ conversationToken: result.token, connectionType: "webrtc" });
  }, [newSink, startSession]);

  const stop = useCallback(() => {
    endedByUser.current = true;
    setPreparing(false);
    endSession();
  }, [endSession]);

  const connected = status === "connected";
  const phase: VoicePhase = connected
    ? isSpeaking
      ? "speaking"
      : "listening"
    : preparing || status === "connecting"
      ? "connecting"
      : "idle";

  return {
    phase,
    connected,
    problem,
    dismissProblem: useCallback(() => setProblem(null), []),
    turns,
    language,
    start,
    stop,
    getInputVolume,
    getOutputVolume,
  };
}
