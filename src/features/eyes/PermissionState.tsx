import Link from "next/link";
import { Button, EmptyState, ErrorState, RegenIcon, buttonClasses } from "@/ui";
import type { CameraProblem } from "./useCamera";

/** `calm`: a setting on this device, not a fault, so it reads as information (no alert, no red). */
const COPY: Record<CameraProblem, { title: string; body: string; canRetry: boolean; calm?: boolean }> = {
  denied: {
    title: "Kameraet er slått av for Lobby",
    body: "Trykk på hengelåsen ved adressen, slå på Kamera, og trykk Slå på kameraet.",
    canRetry: true,
    calm: true,
  },
  notfound: {
    title: "Fant ikke noe kamera",
    body: "Koble til et kamera, eller åpne Lobby på telefonen.",
    canRetry: true,
    calm: true,
  },
  insecure: {
    title: "Kameraet krever en sikker adresse",
    body: "Nettleseren slår av kameraet når siden ikke er sikker. Åpne Lobby over https, eller på localhost.",
    canRetry: false,
  },
  error: {
    title: "Kameraet startet ikke",
    body: "Lukk andre apper som bruker kameraet, og prøv igjen.",
    canRetry: true,
  },
};

/** Its own screen when the camera can't start: what happened, and how to fix it. */
export function PermissionState({ problem, onRetry }: { problem: CameraProblem; onRetry: () => void }) {
  const copy = COPY[problem];
  if (copy.calm) {
    return (
      <div className="flex flex-1 items-center px-4 py-12 sm:px-8 lg:px-12">
        <EmptyState
          icon={<RegenIcon name="eye" size={32} />}
          title={copy.title}
          body={copy.body}
          action={<Button onClick={onRetry}>Slå på kameraet</Button>}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-center px-4 py-12 sm:px-8 lg:px-12">
      <ErrorState
        title={copy.title}
        body={copy.body}
        action={
          copy.canRetry ? (
            <Button onClick={onRetry}>Prøv igjen</Button>
          ) : (
            <Link href="/" className={buttonClasses("secondary")}>
              Gå til forsiden
            </Link>
          )
        }
      />
    </div>
  );
}
