"use client";

import { useId, useState } from "react";
import { ROLE_LABEL, ROLES, type Role } from "@/features/auth/roles";
import { useSession } from "@/features/auth/session";
import { cx } from "./cx";
import { RegenIcon } from "./icons/RegenIcon";
import { Monogram } from "./Monogram";

/**
 * Bottom-left of the navigation: who is logged in (a generated monogram, the name, the role). For
 * admins the plate opens a view switcher (Admin · Resepsjonist · Robotansvarlig) that calls
 * `switchView`; everyone else gets the plate alone.
 */
export function UserPlate({ className, onSwitched }: { className?: string; onSwitched?: () => void }) {
  const { user, view, switchView } = useSession();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const admin = user.role === "admin";
  const roleWord = admin && view !== "admin" ? `${ROLE_LABEL.admin} · viser som ${ROLE_LABEL[view].toLowerCase()}` : ROLE_LABEL[user.role];

  const plate = (
    <>
      <Monogram name={user.name} />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-sm font-semibold">{user.name}</span>
        <span className="truncate text-xs text-muted">{roleWord}</span>
      </span>
    </>
  );

  if (!admin) {
    return <div className={cx("flex items-center gap-3 px-3 py-3", className)}>{plate}</div>;
  }

  return (
    <div className={cx("flex flex-col gap-1", className)}>
      {open && (
        <div id={listId} role="radiogroup" aria-label="Vis som" className="flex flex-col gap-0.5 rounded-sm bg-sunken p-1 animate-fade">
          {ROLES.map((role) => (
            <ViewOption
              key={role}
              role={role}
              checked={view === role}
              onPick={() => {
                switchView(role);
                setOpen(false);
                onSwitched?.();
              }}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cx(
          "flex min-h-14 w-full items-center gap-3 rounded-sm px-3 py-2 text-left",
          "transition-colors duration-[120ms] ease-standard hover:bg-sunken focus-visible:outline-offset-[-2px]",
        )}
      >
        {plate}
        <RegenIcon name="chevrons-up-down" size={18} className="shrink-0 text-muted" />
      </button>
    </div>
  );
}

function ViewOption({ role, checked, onPick }: { role: Role; checked: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onPick}
      className={cx(
        "flex min-h-10 items-center justify-between gap-2 rounded-sm px-3 text-sm",
        "transition-colors duration-[120ms] ease-standard focus-visible:outline-offset-[-2px]",
        checked ? "bg-surface font-semibold text-text" : "text-muted hover:text-text",
      )}
    >
      {ROLE_LABEL[role]}
      {checked && <RegenIcon name="check" size={16} className="text-accent-text" />}
    </button>
  );
}
