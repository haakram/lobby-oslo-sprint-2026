"use client";

import { useConversation, useConversationClientTool, type MessagePayload } from "@elevenlabs/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { detectLanguage, type LanguageCode } from "./language";
import { createClientTools, type VoiceUi } from "./tools";

export type VoicePhase = "idle" | "connecting" | "listening" | "speaking";

export type VoiceProblem =
  | { kind: "mic-denied" }
  | { kind: "no-mic" }
  | { kind: "not-set-up" }
  | { kind: "connection" };

export type Turn = {
  id: string;
  role: "user" | "agent";
  text: string;
  language: LanguageCode | null;
};

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
    const response = await fetch("/api/voice/token", { cache: "no-store" });
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
 * The Lobby voice session: microphone check, server token, ElevenLabs WebRTC session,
 * transcript and the four allowlisted client tools. Must be used inside `ConversationProvider`.
 */
export function useLobbyVoice(ui: VoiceUi) {
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<VoiceProblem | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [language, setLanguage] = useState<LanguageCode | null>(null);
  // Set when the person ends the session, so a normal hang-up is not shown as a dropped line.
  const endedByUser = useRef(false);

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

  const tools = useMemo(() => createClientTools(ui), [ui]);
  useConversationClientTool("show_product", tools.show_product);
  useConversationClientTool("show_route", tools.show_route);
  useConversationClientTool("show_guide", tools.show_guide);
  useConversationClientTool("queue_robot_task", tools.queue_robot_task);

  const { startSession, endSession, status, isSpeaking, getInputVolume, getOutputVolume, sendContextualUpdate } =
    conversation;

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
    startSession({ conversationToken: result.token, connectionType: "webrtc" });
  }, [startSession]);

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
    /** Tell the agent what the person did on screen (e.g. confirmed a task). Our text, not speech. */
    tellAgent: useCallback(
      (text: string) => {
        if (connected) sendContextualUpdate(text);
      },
      [connected, sendContextualUpdate],
    ),
  };
}
