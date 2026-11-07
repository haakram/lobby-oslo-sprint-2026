"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { useSession } from "@/features/auth/SessionProvider";
import { DashboardScreen } from "./DashboardScreen";
import { ReceptionDesk } from "./ReceptionDesk";
import { RobotDesk } from "./RobotDesk";
import { standardEase } from "./useEntrance";

gsap.registerPlugin(useGSAP);

/**
 * `/` is a different desk per effective role: the admin's Oversikt, the receptionist's day, the
 * robot manager's robot. The desk fades in (400 ms; none under reduced motion). The proxy has
 * already sent anyone logged out to /login, so a missing role falls through to the admin's desk.
 */
export function HomeByRole({ viewerUrl }: { viewerUrl?: string }) {
  const { effectiveRole } = useSession();
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (typeof window.matchMedia !== "function") return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(scope.current, { autoAlpha: 0, duration: 0.4, ease: standardEase(), clearProps: "opacity,visibility" });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [effectiveRole] },
  );

  return (
    <div ref={scope} key={effectiveRole ?? "admin"} className="flex min-w-0 flex-1 flex-col">
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
