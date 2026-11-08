"use client";

import Link from "next/link";
import { canAccess } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { cx } from "./cx";
import { RegenIcon } from "./icons/RegenIcon";

/** The handover page the pitch is named after (Overlevering 06:00). */
export const HANDOVER_HREF = "/overlevering";

/**
 * "Se overleveringen": the way from Oversikt to the morning manager's page (jury round 1: it was
 * reachable only from the rail). Orange as text, like *Åpne*, so it reads as a link on the dark top bar
 * without competing with the screen's one primary action. Nothing for a role that can't open the page.
 */
export function HandoverLink({ className }: { className?: string }) {
  const { effectiveRole } = useSession();
  if (!effectiveRole || !canAccess(effectiveRole, HANDOVER_HREF)) return null;
  return (
    <Link
      href={HANDOVER_HREF}
      className={cx(
        "inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-text underline-offset-4 hover:underline",
        "focus-visible:outline-offset-2",
        className,
      )}
    >
      Se overleveringen
      <RegenIcon name="arrow-right" size={16} strokeWidth={2} />
    </Link>
  );
}
