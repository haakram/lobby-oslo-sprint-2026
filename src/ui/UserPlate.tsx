"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { ROLES, type Role, roleLabel } from "@/features/auth/roles";
import { useSession } from "@/features/auth/SessionProvider";
import { cx } from "./cx";
import { RegenIcon } from "./icons/RegenIcon";
import { Monogram } from "./Monogram";

/**
 * Bottom-left of the navigation: who is logged in (a generated monogram, the name, the role). The
 * plate opens a small menu: for admins the view switcher (Admin · Resepsjonist · Robotansvarlig),
 * which calls `switchView` (the server reloads the page), and "Logg ut" for everyone. Escape or a
 * click outside closes the menu; the arrow keys move between the views (one Tab stop for the group).
 */
export function UserPlate({ className, onSwitched }: { className?: string; onSwitched?: () => void }) {
  const { user, view, switchView, logout } = useSession();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Role | "logout" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const plateButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

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

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    // Close only this menu: inside the Meny sheet, the sheet stays open (it skips a handled Escape).
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    plateButton.current?.focus();
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
    <div ref={root} onKeyDown={onKeyDown} className={cx("flex flex-col gap-1", className)}>
      {open && (
        <div id={listId} className="flex flex-col gap-0.5 rounded-sm bg-sunken p-1 animate-fade">
          {admin && (
            <div role="radiogroup" aria-label="Vis som" onKeyDown={moveBetweenViews} className="flex flex-col gap-0.5">
              <p className="px-3 pt-1.5 pb-0.5 text-xs text-muted">Vis som</p>
              {ROLES.map((role, index) => (
                <ViewOption
                  key={role}
                  role={role}
                  checked={view === role}
                  tabbable={view === role || (index === 0 && !ROLES.includes(view as Role))}
                  pending={pending === role}
                  onPick={() => void pick(role)}
                />
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="px-3 py-1 text-sm text-danger">
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
        ref={plateButton}
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

/** Arrow keys move focus between the views; Space or Enter picks one (picking reloads the page). */
function moveBetweenViews(event: KeyboardEvent<HTMLDivElement>) {
  const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
  if (step === 0) return;
  event.preventDefault();
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const index = radios.findIndex((radio) => radio === document.activeElement);
  radios[(index + step + radios.length) % radios.length]?.focus();
}

function ViewOption({ role, checked, tabbable, pending, onPick }: { role: Role; checked: boolean; tabbable: boolean; pending: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={tabbable ? 0 : -1}
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
