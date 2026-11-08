"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { canAccess, useSession } from "@/features/auth";
import { placeLabel } from "@/features/dashboard/labels";
import { SourceNote } from "@/features/modules/SourceNote";
import { formatDuration } from "@/features/reception/format";
import { Badge, Sheet } from "@/ui";
import type { PhoneTask } from "./phoneTasks";

/** Only the last three digits are shown, as the receptionist says them back to the guest. */
function phoneEnding(phone: string): string {
  return phone.replace(/\D/g, "").slice(-3);
}

function Field({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono tabular-nums" : "min-w-0 break-words"}>{children}</dd>
    </>
  );
}

/**
 * The call a phone task came from: who called, when, what they said and what the AI receptionist took
 * down. A live call links on to its record on Resepsjon (for the roles that may open it).
 */
export function CallSheet({ task, open, onClose }: { task: PhoneTask | null; open: boolean; onClose: () => void }) {
  const { effectiveRole } = useSession();
  const reception = effectiveRole === null || canAccess(effectiveRole, "/resepsjon");
  const demo = task?.demo ?? null;
  return (
    <Sheet open={open && task !== null} onClose={onClose} title={task ? `Samtalen kl. ${task.at}` : ""}>
      {task && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Telefon (AI)</Badge>
            <span className="text-sm text-muted">AI-resepsjonisten tok samtalen og la saken i Forespørsler.</span>
          </div>

          {demo && (
            <figure className="flex flex-col gap-1">
              <figcaption className="text-sm text-muted">Gjesten sa</figcaption>
              <blockquote lang={demo.quoteLang} className="border-l-2 border-line-strong pl-4 text-base">
                «{demo.quote}»
              </blockquote>
            </figure>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted">AI-resepsjonisten noterte</p>
            <p className="text-base font-semibold">{task.record.message}</p>
          </div>

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-base">
            <Field label="Gjest">{task.record.name}</Field>
            <Field label="Rom">{placeLabel(task.room)}</Field>
            {task.record.phone && (
              <Field label="Telefon">
                slutter på <span className="font-mono tabular-nums">{phoneEnding(task.record.phone)}</span>
              </Field>
            )}
            {demo && (
              <>
                <Field label="Lengde" mono>
                  {formatDuration(demo.durationSecs)}
                </Field>
                <Field label="Språk">{demo.language}</Field>
              </>
            )}
            <Field label="Oppgave">
              {task.kind}, {task.robotCan ? "roboten kan ta den" : `for ${task.staff.name}`}
            </Field>
          </dl>

          {task.origin !== "demo" && reception && (
            <Link
              href={task.origin === "record" ? `/resepsjon#record-${encodeURIComponent(task.record.id)}` : "/resepsjon"}
              className="flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline"
            >
              {task.origin === "record" ? "Åpne beskjeden i Resepsjon" : "Åpne samtaleloggen i Resepsjon"}
            </Link>
          )}
          <SourceNote sources={demo ? "test" : "reception"} />
        </div>
      )}
    </Sheet>
  );
}
