"use client";

import { Button, Sheet } from "@/ui";

/**
 * The only way a voice request reaches the robot: Fettero proposes, a person reads and taps Bekreft.
 * `text` came from speech, so it is shown as plain text and never interpreted.
 */
export function ConfirmTaskSheet({
  text,
  onConfirm,
  onCancel,
}: {
  text: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet open={text !== null} onClose={onCancel} title="Bekreft oppgave til roboten">
      <p className="text-base text-muted">Fettero foreslår denne oppgaven ut fra samtalen. Ingenting sendes før du bekrefter.</p>
      <blockquote className="mt-4 rounded-md border-l-4 border-accent bg-sunken px-4 py-3 text-lg font-medium break-words text-text">
        {text}
      </blockquote>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" onClick={onCancel}>
          Avbryt
        </Button>
        <Button size="lg" onClick={onConfirm}>
          Bekreft
        </Button>
      </div>
    </Sheet>
  );
}
