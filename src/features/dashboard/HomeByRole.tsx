"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { useSession } from "@/features/auth/session";
import { Skeleton } from "@/ui";
import { DashboardScreen } from "./DashboardScreen";
import { ReceptionDesk } from "./ReceptionDesk";
import { RobotDesk } from "./RobotDesk";
import { standardEase } from "./useEntrance";

gsap.registerPlugin(useGSAP);

/**
 * `/` is a different desk per effective role: the admin's Oversikt, the receptionist's day, the
 * robot manager's robot. Switching view crossfades the desk (400 ms; none under reduced motion).
 */
export function HomeByRole({ viewerUrl }: { viewerUrl?: string }) {
  const { effectiveRole, ready } = useSession();
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!ready || typeof window.matchMedia !== "function") return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(scope.current, { autoAlpha: 0, duration: 0.4, ease: standardEase(), clearProps: "opacity,visibility" });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [effectiveRole, ready] },
  );

  if (!ready) {
    return (
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10" aria-busy="true" aria-label="Henter pulten din">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-40 w-full" />
      </main>
    );
  }

  return (
    <div ref={scope} key={effectiveRole} className="flex min-w-0 flex-1 flex-col">
      {effectiveRole === "receptionist" ? (
        <ReceptionDesk viewerUrl={viewerUrl} />
      ) : effectiveRole === "robot" ? (
        <RobotDesk viewerUrl={viewerUrl} />
      ) : (
        <DashboardScreen viewerUrl={viewerUrl} />
      )}
    </div>
  );
}
