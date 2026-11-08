"use client";

import { useSyncExternalStore } from "react";
import { maskPhone, telHref } from "./maskPhone";

/** A phone or a tablet: a finger, not a mouse. Only there does a tap place a call. */
const TOUCH = "(pointer: coarse)";

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(TOUCH);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** A laptop until the browser says otherwise (the server and jsdom have no media queries). */
function readTouch() {
  return typeof window.matchMedia === "function" && window.matchMedia(TOUCH).matches;
}

/**
 * A caller's number as the screen shows it, "+47 ••• •• 493". On a phone it is a tap that calls them back;
 * on a laptop (a mouse, perhaps a projector) it is the masked text only, with no link: a hover would
 * otherwise show the full tel: number in the status bar, and the DOM would carry it. The full number is
 * never text. `phone` may already be masked (the call log masks on the server); `tel` is the link, when there is one.
 */
export function PhoneLink({ phone, tel }: { phone: string; tel?: string | null }) {
  const touch = useSyncExternalStore(subscribe, readTouch, () => false);
  const shown = maskPhone(phone);
  const href = touch ? (tel === undefined ? telHref(phone) : tel) : null;
  const ending = shown.replace(/\D/g, "").slice(-3);
  if (!href) return <span className="font-mono text-text tabular-nums">{shown}</span>;
  return (
    <a
      href={href}
      aria-label={`Ring tilbake, nummeret slutter på ${ending}`}
      className="-my-2 inline-flex min-h-10 items-center font-mono font-semibold text-accent-text tabular-nums hover:underline pointer-coarse:min-h-11"
    >
      {shown}
    </a>
  );
}
