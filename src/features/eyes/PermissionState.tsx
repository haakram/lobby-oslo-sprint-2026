import Link from "next/link";
import { Button, ErrorState, buttonClasses } from "@/ui";
import type { CameraProblem } from "./useCamera";

const COPY: Record<CameraProblem, { title: string; body: string; canRetry: boolean }> = {
  denied: {
    title: "Kameraet er blokkert",
    body: "Gi Lobby tilgang til kameraet: trykk på hengelåsen ved adressen, slå på Kamera, og prøv igjen.",
    canRetry: true,
  },
  notfound: {
    title: "Fant ikke noe kamera",
    body: "Koble til et kamera, eller åpne Lobby på telefonen, og prøv igjen.",
    canRetry: true,
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
