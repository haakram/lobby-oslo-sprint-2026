"use client";

import { useState } from "react";
import { Button } from "@/ui";
import { roleLabel } from "./roles";
import { useSession } from "./SessionProvider";

/** Shown only while an admin views the app as another role: what they see, and the way back. */
export function ViewAsBanner() {
  const { user, view, switchView } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || user.role !== "admin" || !view || view === "admin") return null;

  async function back() {
    setPending(true);
    setError(null);
    try {
      await switchView("admin");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fikk ikke byttet visning. Prøv igjen.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-accent-soft px-4 py-2 md:px-8 lg:px-12">
      <p className="text-sm font-semibold text-accent-text">Viser som {roleLabel(view)}</p>
      <div className="flex items-center gap-3">
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button variant="secondary" loading={pending} onClick={back}>
          Tilbake til admin
        </Button>
      </div>
    </div>
  );
}
