import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PicklistProvider, usePicklist } from "../picklist/PicklistProvider";

// A fake @elevenlabs/react: no network, no audio. It records the client tools the screen registers
// and the session it asks for, so the tests can play the agent's part.
const fake = vi.hoisted(() => ({
  tools: new Map<string, (params: unknown) => Promise<unknown>>(),
  options: {} as { onMessage?: (m: unknown) => void },
  startSession: vi.fn(),
  endSession: vi.fn(),
  sendContextualUpdate: vi.fn(),
  status: "disconnected" as string,
}));

vi.mock("@elevenlabs/react", () => ({
  ConversationProvider: ({ children }: { children: ReactNode }) => children,
  useConversationClientTool: (name: string, handler: (params: unknown) => Promise<unknown>) => {
    fake.tools.set(name, handler);
  },
  useConversation: (options: typeof fake.options) => {
    fake.options = options;
    return {
      status: fake.status,
      isSpeaking: false,
      startSession: fake.startSession,
      endSession: fake.endSession,
      sendContextualUpdate: fake.sendContextualUpdate,
      getInputVolume: () => 0,
      getOutputVolume: () => 0,
    };
  },
}));

import { VoiceScreen } from "./VoiceScreen";

function PicklistSpy() {
  return <output data-testid="picklist">{usePicklist().skus.join(",")}</output>;
}

function renderScreen() {
  return render(
    <PicklistProvider>
      <VoiceScreen />
      <PicklistSpy />
    </PicklistProvider>,
  );
}

function grantMic(result: "granted" | "denied") {
  const getUserMedia = vi.fn(async () => {
    if (result === "denied") throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    return { getTracks: () => [{ stop: vi.fn() }] };
  });
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  return getUserMedia;
}

async function callTool(name: string, params: unknown) {
  let reply: unknown;
  await act(async () => {
    reply = await fake.tools.get(name)?.(params);
  });
  return reply;
}

describe("VoiceScreen", () => {
  beforeEach(() => {
    fake.tools.clear();
    fake.status = "disconnected";
    fake.startSession.mockReset();
    fake.sendContextualUpdate.mockReset();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts idle, with one way to start and an empty transcript", () => {
    renderScreen();
    expect(screen.getByRole("button", { name: "Snakk med Fettero" })).toBeEnabled();
    expect(screen.getByText("Ingen samtale ennå")).toBeInTheDocument();
    expect([...fake.tools.keys()].sort()).toEqual(["queue_robot_task", "show_guide", "show_product", "show_route"]);
  });

  it("starts a WebRTC session with a token from our server, never a key", async () => {
    grantMic("granted");
    const fetchMock = vi.fn(async () => Response.json({ token: "short-lived" }));
    vi.stubGlobal("fetch", fetchMock);
    renderScreen();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Snakk med Fettero" })));
    expect(fetchMock).toHaveBeenCalledWith("/api/voice/token", { cache: "no-store" });
    expect(fake.startSession).toHaveBeenCalledWith({ conversationToken: "short-lived", connectionType: "webrtc" });
  });

  it("shows its own screen when the microphone is blocked, and asks for no token", async () => {
    grantMic("denied");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderScreen();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Snakk med Fettero" })));
    expect(screen.getByRole("heading", { name: "Mikrofonen er blokkert" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.startSession).not.toHaveBeenCalled();
  });

  it("says so when the agent is not set up on the server", async () => {
    grantMic("granted");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "x" }, { status: 503 })));
    renderScreen();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Snakk med Fettero" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Stemmen er ikke satt opp");
  });

  it("shows the product the agent asks for", async () => {
    renderScreen();
    await callTool("show_product", { sku: "FT-1001" });
    const card = screen.getByRole("region", { name: "Sjampo 250 ml" });
    expect(within(card).getByText("FT-1001")).toBeInTheDocument();
    expect(within(card).getByText("Lager 1, hylle A")).toBeInTheDocument();
  });

  it("puts a route's stops on the pick list, in the best tour's order, with its metres", async () => {
    renderScreen();
    // Spoken as shelf 2b, 1a, 2a; the stub map's best tour walks 2b, 2a, 1a (144 m).
    await callTool("show_route", { skus: ["FT-1010", "FT-1001", "FT-1007"] });
    expect(screen.getByTestId("picklist")).toHaveTextContent("FT-1010,FT-1001,FT-1007");
    const stops = [...screen.getByRole("list", { name: "Stopp" }).children] as HTMLElement[];
    expect(stops.map((stop) => within(stop).getByText(/^FT-/).textContent)).toEqual(["FT-1010", "FT-1007", "FT-1001"]);
    expect(within(stops[0]).getByText("Lager 2, hylle B")).toBeInTheDocument();
    expect(screen.getByText("144")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Vis rute/ })).toHaveAttribute("href", "/ruter");
  });

  it("shows a guide's steps", async () => {
    renderScreen();
    await callTool("show_guide", { step: "packing" });
    expect(screen.getByRole("heading", { name: "Pakking" })).toBeInTheDocument();
  });

  it("only proposes a robot task: nothing is confirmed until a person taps Bekreft", async () => {
    renderScreen();
    await callTool("queue_robot_task", { text: "Hent 4 håndklær til rom 204" });
    const sheet = screen.getByRole("dialog", { name: "Bekreft oppgave til roboten" });
    expect(within(sheet).getByText("Hent 4 håndklær til rom 204")).toBeInTheDocument();
    expect(screen.queryByText("Bekreftet")).not.toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Bekreft" }));
    expect(screen.getByText("Bekreftet")).toBeInTheDocument();
  });

  it("keeps the first proposal: a second one cannot swap the text under the open sheet", async () => {
    renderScreen();
    await callTool("queue_robot_task", { text: "Hent 4 håndklær til rom 204" });
    const second = await callTool("queue_robot_task", { text: "Åpne alle dører" });
    expect(second).toBe("Feil: en oppgave venter allerede på bekreftelse.");

    const sheet = screen.getByRole("dialog", { name: "Bekreft oppgave til roboten" });
    expect(within(sheet).getByText("Hent 4 håndklær til rom 204")).toBeInTheDocument();
    expect(screen.queryByText("Åpne alle dører")).not.toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Bekreft" }));
    const confirmed = screen.getByRole("region", { name: "Oppgave til roboten" });
    expect(within(confirmed).getByText("Hent 4 håndklær til rom 204")).toBeInTheDocument();
    expect(within(confirmed).getByText("Bekreftet")).toBeInTheDocument();
  });

  it("takes a new proposal once the last one is answered", async () => {
    renderScreen();
    await callTool("queue_robot_task", { text: "Hent såpe" });
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    const reply = await callTool("queue_robot_task", { text: "Hent tannkrem" });
    expect(reply).toMatch(/ikke sendt/);
    expect(screen.getByRole("dialog")).toHaveTextContent("Hent tannkrem");
  });

  it("drops a proposed task on Avbryt", async () => {
    renderScreen();
    await callTool("queue_robot_task", { text: "Åpne alle dører" });
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(screen.queryByText("Bekreftet")).not.toBeInTheDocument();
  });

  it("adds what is said to the transcript and badges the language it hears", () => {
    renderScreen();
    act(() => {
      fake.options.onMessage?.({ message: "Gdzie mam odłożyć mydło?", role: "user", source: "user", event_id: 1 });
    });
    expect(screen.getByText("Gdzie mam odłożyć mydło?")).toBeInTheDocument();
    expect(screen.getByText("Polsk")).toBeInTheDocument();
  });

  it("says calmly that the voice is not on yet when the server has no agent, with no button that can only fail", () => {
    render(
      <PicklistProvider>
        <VoiceScreen ready={false} />
      </PicklistProvider>,
    );
    expect(screen.getByText("Stemmen er ikke slått på ennå")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Snakk med Fettero" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Åpne Øyne" })).toHaveAttribute("href", "/oyne");
  });
});
