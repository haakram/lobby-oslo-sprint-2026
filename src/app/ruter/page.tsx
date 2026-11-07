import type { Metadata } from "next";
import { ComingSoon } from "@/ui";

export const metadata: Metadata = { title: "Ruter" };

// TODO(phase-2): the Ruter screen replaces this placeholder.
export default function Page() {
  return <ComingSoon title="Ruter" description="Korteste vei mellom hyllene, på tvers av etasjer." surface="light" />;
}
