import { maskPhone, telHref } from "./maskPhone";

/**
 * A caller's number as the screen shows it, "+47 ••• •• 493", and a tap that calls them back. The full
 * number lives only in the tel: link, never in the text, so it doesn't reach a projector or a screenshot.
 * `shown` is an already-masked number (the call log masks on the server); `tel` the link, when there is one.
 */
export function PhoneLink({ phone, tel }: { phone: string; tel?: string | null }) {
  const shown = maskPhone(phone);
  const href = tel === undefined ? telHref(phone) : tel;
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
