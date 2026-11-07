"use client";

import { ROLE_LABEL } from "@/features/auth/roles";
import { useSession } from "@/features/auth/session";
import { RegenIcon } from "./icons/RegenIcon";

/** The thin band an admin sees while looking at another role's desk, with the way back. */
export function ViewingAs() {
  const { user, view, switchView } = useSession();
  if (user.role !== "admin" || view === "admin") return null;
  return (
    <div
      role="status"
      data-surface="dark"
      className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-accent-soft px-4 py-1.5 text-sm text-text sm:px-6 lg:px-10"
    >
      <span className="flex items-center gap-2">
        <RegenIcon name="eye" size={18} className="text-accent-text" />
        Viser som {ROLE_LABEL[view]}
      </span>
      <button
        type="button"
        onClick={() => switchView("admin")}
        className="inline-flex min-h-8 items-center gap-1 rounded-sm px-2 font-semibold text-accent-text hover:underline focus-visible:outline-offset-[-2px]"
      >
        Tilbake til admin
      </button>
    </div>
  );
}
