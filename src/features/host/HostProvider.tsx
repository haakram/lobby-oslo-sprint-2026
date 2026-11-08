"use client";

import { createContext, type ReactNode, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { APARTMENTS, CLEANER, dayWord, firstName, type HostDay, hostDay, isLow, type Supply } from "./demoData";

/**
 * The host's day for every screen under /vert, held in the /vert layout so a choice made in the bell
 * (order coffee, answer a guest) shows on every page. The day is computed in the browser from the Oslo
 * clock: the server renders the loading state, so the markup never disagrees about the time.
 */

/** `?demo=tom` shows the empty state, `?demo=feil` the error state; neither is on the demo path. */
export type DemoMode = "ready" | "empty" | "error";

export type LateCheckout = "accepted" | "declined" | null;

export type BellItem = {
  id: string;
  tone: "danger" | "warning" | "neutral";
  title: string;
  body: string;
  /** Done items stay in the bell with what was done, so the click has a visible result. */
  done: boolean;
  doneText: string;
  action?: { label: string; run: () => void };
  link?: { href: string; label: string };
};

export type HostReady = {
  kind: "ready";
  day: HostDay;
  bell: BellItem[];
  ordered: boolean;
  lateCheckout: LateCheckout;
  serviceConfirmed: boolean;
  orderSupplies: () => void;
  answerLateCheckout: (answer: Exclude<LateCheckout, null>) => void;
  confirmService: () => void;
};

export type HostState = { kind: "loading" } | { kind: "empty" } | { kind: "error"; retry: () => void } | HostReady;

const HostContext = createContext<HostState>({ kind: "loading" });

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 20_000);
  return () => clearInterval(timer);
}

/** The minute now (ms / 60 000), or null on the server and while hydrating. */
function useMinute(): number | null {
  return useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 60_000), () => null);
}

function modeFromUrl(): DemoMode {
  const demo = new URLSearchParams(window.location.search).get("demo");
  return demo === "tom" ? "empty" : demo === "feil" ? "error" : "ready";
}

const noChange = () => () => {};

/** The mode the URL asks for; null on the server and while hydrating (the loading state). */
function useUrlMode(): DemoMode | null {
  return useSyncExternalStore(noChange, modeFromUrl, () => null);
}

/** Low items, plus anything under half of what should be there: one order covers both. */
export function toOrder(supplies: Supply[]): Supply[] {
  return supplies.filter((supply) => isLow(supply) || supply.count < supply.par / 2);
}

export function HostProvider({ children, now: fixedNow, mode: fixedMode }: { children: ReactNode; now?: Date; mode?: DemoMode }) {
  const minute = useMinute();
  const urlMode = useUrlMode();
  const [override, setMode] = useState<DemoMode | null>(null);
  const mode = override ?? fixedMode ?? urlMode;
  const [ordered, setOrdered] = useState(false);
  const [lateCheckout, setLateCheckout] = useState<LateCheckout>(null);
  const [serviceConfirmed, setServiceConfirmed] = useState(false);

  const nowMs = fixedNow ? fixedNow.getTime() : minute === null ? null : minute * 60_000;
  const day = useMemo(() => (nowMs === null || mode !== "ready" ? null : hostDay(new Date(nowMs))), [nowMs, mode]);

  const value = useMemo<HostState>(() => {
    if (mode === "error") return { kind: "error", retry: () => setMode("ready") };
    if (mode === "empty") return { kind: "empty" };
    if (!day || mode === null) return { kind: "loading" };
    const orderSupplies = () => setOrdered(true);
    const answerLateCheckout = (answer: Exclude<LateCheckout, null>) => setLateCheckout(answer);
    const confirmService = () => setServiceConfirmed(true);
    return {
      kind: "ready",
      day,
      bell: bellItems(day, { ordered, lateCheckout, serviceConfirmed, orderSupplies, answerLateCheckout, confirmService }),
      ordered,
      lateCheckout,
      serviceConfirmed,
      orderSupplies,
      answerLateCheckout,
      confirmService,
    };
  }, [day, mode, ordered, lateCheckout, serviceConfirmed]);

  return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
}

const LOADING: HostState = { kind: "loading" };

/**
 * The host's day, or loading while this component hydrates. The provider sits in the layout and can
 * switch to the browser's values before a page below it has hydrated; judging "hydrated" here, per
 * component, keeps every page's first client render equal to the server's.
 */
export function useHost(): HostState {
  const state = useContext(HostContext);
  const hydrated = useSyncExternalStore(noChange, () => true, () => false);
  return hydrated ? state : LOADING;
}

type Handlers = Pick<HostReady, "ordered" | "lateCheckout" | "serviceConfirmed" | "orderSupplies" | "answerLateCheckout" | "confirmService">;

const APARTMENT_NAME = new Map(APARTMENTS.map((apartment) => [apartment.id, apartment.name]));
const CLEANER_FIRST = firstName(CLEANER);

/**
 * The few things that need the host, loudest first: a guest about to arrive to an apartment that is not
 * ready (never on a good day), then low supplies, then decisions only the host can make.
 */
export function bellItems(day: HostDay, handlers: Handlers): BellItem[] {
  const items: BellItem[] = day.problems.map(({ apartment, guard }) => ({
    id: `problem-${apartment.id}-${guard.id}`,
    tone: "danger" as const,
    title: `${apartment.name}: ${guard.word.toLowerCase()}`,
    body: "Gjesten kommer i dag. Ring renholderen, eller send koden på nytt fra meldingene.",
    done: false,
    doneText: "",
    link: { href: "/vert", label: "Se dagens bytter" },
  }));

  for (const supply of day.supplies.filter(isLow)) {
    items.push({
      id: `low-${supply.apartment}-${supply.item}`,
      tone: "warning",
      title: `Lav på ${supply.item.toLowerCase()} i ${APARTMENT_NAME.get(supply.apartment)}`,
      body: `${supply.count} av ${supply.par} ${supply.unit} igjen. Bestill nå, så tar ${CLEANER_FIRST} det med ved neste rengjøring.`,
      done: handlers.ordered,
      doneText: `Påfyll bestilt. ${CLEANER_FIRST} tar det med ved neste rengjøring.`,
      action: { label: "Bestill påfyll", run: handlers.orderSupplies },
    });
  }

  const waiting = day.threads.find((thread) => thread.reply.kind === "waiting");
  if (waiting) {
    const stay = day.calendar.find((entry) => entry.guest === waiting.guest);
    const when = stay ? dayWord(day.today, stay.to) : "";
    items.push({
      id: `reply-${waiting.id}`,
      tone: "neutral",
      title: `${firstName(waiting.guest)} spør om sen utsjekk ${when}`.trim(),
      body: waiting.reply.kind === "waiting" ? waiting.reply.suggestion : "",
      done: handlers.lateCheckout !== null,
      doneText: handlers.lateCheckout === "declined" ? `${firstName(waiting.guest)} har fått et vennlig nei, på italiensk.` : `Sagt ja. ${firstName(waiting.guest)} har fått svar på italiensk.`,
      action: { label: "Si ja", run: () => handlers.answerLateCheckout("accepted") },
      link: { href: "/vert/meldinger", label: "Les meldingen" },
    });
  }

  const service = day.maintenance.find((entry) => entry.state === "planlagt");
  if (service) {
    items.push({
      id: `service-${service.id}`,
      tone: "neutral",
      title: `Bekreft: ${service.title.toLowerCase()}`,
      body: `${APARTMENT_NAME.get(service.apartment)}. ${service.text}`,
      done: handlers.serviceConfirmed,
      doneText: "Bekreftet. Teknikeren har fått beskjed.",
      action: { label: "Bekreft", run: handlers.confirmService },
    });
  }
  return items;
}
