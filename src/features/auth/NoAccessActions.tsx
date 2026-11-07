"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClasses } from "@/ui";
import { useSession } from "./SessionProvider";

/**
 * The way out of a 403: home, plus "open as admin" for an admin viewing as another role (back to the admin
 * view, on this same page), else log out.
 */
export function NoAccessActions() {
  const { user, view, switchView, logout } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewingAs = user?.role === "admin" && view !== "admin";

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Det virket ikke. Prøv igjen.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3 pt-2">
      <div className="flex flex-wrap gap-3">
        <Link href="/" className={buttonClasses("primary")}>
          Gå til forsiden
        </Link>
        {viewingAs ? (
          <Button variant="secondary" loading={pending} onClick={() => run(() => switchView("admin"))}>
            Åpne som admin
          </Button>
        ) : (
          <Button variant="secondary" loading={pending} onClick={() => run(logout)}>
            Logg ut
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
