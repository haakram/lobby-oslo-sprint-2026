"use client";

import { useId, useState } from "react";
import { ROLES, type Role, roleLabel } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { cx } from "./cx";
import { RegenIcon } from "./icons/RegenIcon";
import { Monogram } from "./Monogram";

/**
 * Bottom-left of the navigation: who is logged in (a generated monogram, the name, the role). The
 * plate opens a small menu: for admins the view switcher (Admin · Resepsjonist · Robotansvarlig),
 * which calls `switchView` (the server reloads the page), and "Logg ut" for everyone.
 */
export function UserPlate({ className, onSwitched }: { className?: string; onSwitched?: () => void }) {
  const { user, view, switchView, logout } = useSession();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Role | "logout" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  if (!user) return null;
  const admin = user.role === "admin";
  const roleWord = admin && view && view !== "admin" ? `Admin · viser som ${roleLabel(view).toLowerCase()}` : roleLabel(user.role);

  async function pick(role: Role) {
    setPending(role);
    setError(null);
    try {
      await switchView(role);
      setOpen(false);
      onSwitched?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fikk ikke byttet visning. Prøv igjen.");
      setPending(null);
    }
  }

  async function out() {
    setPending("logout");
    await logout();
  }

  const plate = (
    <>
      <Monogram name={user.name} />
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-sm font-semibold">{user.name}</span>
        <span className="truncate text-xs text-muted">{roleWord}</span>
      </span>
    </>
  );

  return (
    <div className={cx("flex flex-col gap-1", className)}>
      {open && (
        <div id={listId} className="flex flex-col gap-0.5 rounded-sm bg-sunken p-1 animate-fade">
          {admin && (
            <div role="radiogroup" aria-label="Vis som" className="flex flex-col gap-0.5">
              <p className="px-3 pt-1.5 pb-0.5 text-xs text-muted">Vis som</p>
              {ROLES.map((role) => (
                <ViewOption key={role} role={role} checked={view === role} pending={pending === role} onPick={() => void pick(role)} />
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="px-3 py-1 text-xs text-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void out()}
            disabled={pending !== null}
            className={cx(
              "flex min-h-10 items-center gap-2 rounded-sm px-3 text-sm text-muted",
              "transition-colors duration-[120ms] ease-standard hover:text-text focus-visible:outline-offset-[-2px] disabled:opacity-50",
              admin && "border-t border-line",
            )}
          >
            <RegenIcon name="log-out" size={16} />
            {pending === "logout" ? "Logger ut …" : "Logg ut"}
          </button>
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

function ViewOption({ role, checked, pending, onPick }: { role: Role; checked: boolean; pending: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-busy={pending || undefined}
      onClick={onPick}
      className={cx(
        "flex min-h-10 items-center justify-between gap-2 rounded-sm px-3 text-sm",
        "transition-colors duration-[120ms] ease-standard focus-visible:outline-offset-[-2px]",
        checked ? "bg-surface font-semibold text-text" : "text-muted hover:text-text",
      )}
    >
      {roleLabel(role)}
      {pending ? <span className="text-xs text-muted">…</span> : checked && <RegenIcon name="check" size={16} className="text-accent-text" />}
    </button>
  );
}
