import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake @elevenlabs/react: no network, no audio. It records the client tools the hook registers.
const fake = vi.hoisted(() => ({
  tools: new Map<string, (params: unknown) => Promise<unknown>>(),
  startSession: vi.fn(),
  endSession: vi.fn(),
}));

vi.mock("@elevenlabs/react", () => ({
  useConversationClientTool: (name: string, handler: (params: unknown) => Promise<unknown>) => {
    fake.tools.set(name, handler);
  },
  useConversation: () => ({
    status: "disconnected",
    isSpeaking: false,
    startSession: fake.startSession,
    endSession: fake.endSession,
    getInputVolume: () => 0,
    getOutputVolume: () => 0,
  }),
}));

import { useReceptionVoice } from "./useReceptionVoice";

const MESSAGE = { name: "Kari", phone: "+47 912 34 567", topic: "question", message: "Har dere parkering?" };

function grantMic() {
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }));
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
}

async function callTool(name: string, params: unknown) {
  let reply: unknown;
  await act(async () => {
    reply = await fake.tools.get(name)?.(params);
  });
  return reply;
}

describe("useReceptionVoice", () => {
  beforeEach(() => {
    fake.tools.clear();
    fake.startSession.mockReset();
    grantMic();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ token: "short-lived" })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers exactly the four reception tools", () => {
    renderHook(() => useReceptionVoice(vi.fn()));
    expect([...fake.tools.keys()].sort()).toEqual([
      "check_availability",
      "get_room_price",
      "record_booking_request",
      "record_message",
    ]);
  });

  it("starts a WebRTC session with a token from the reception route", async () => {
    const { result } = renderHook(() => useReceptionVoice(vi.fn()));
    await act(() => result.current.start());
    expect(fetch).toHaveBeenCalledWith("/api/reception/token", { cache: "no-store" });
    expect(fake.startSession).toHaveBeenCalledWith({ conversationToken: "short-lived", connectionType: "webrtc" });
  });

  it("hands each new record to onRecord once per call, with a fresh sink for the next call", async () => {
    const onRecord = vi.fn();
    const { result } = renderHook(() => useReceptionVoice(onRecord));
    await act(() => result.current.start());
    expect(await callTool("record_message", MESSAGE)).toMatch(/registrert/);
    expect(await callTool("record_message", MESSAGE)).toBe("Denne beskjeden er allerede registrert.");
    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(onRecord.mock.calls[0][0]).toMatchObject({ kind: "message", name: "Kari", topic: "question" });

    await act(() => result.current.start());
    await callTool("record_message", MESSAGE);
    expect(onRecord).toHaveBeenCalledTimes(2);
  });
});
