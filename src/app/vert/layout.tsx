import type { ReactNode } from "react";
import { HostProvider } from "@/features/host/HostProvider";

// One provider for every screen under /vert, so what the host does in the bell shows on every page.
export default function HostLayout({ children }: { children: ReactNode }) {
  return <HostProvider>{children}</HostProvider>;
}
