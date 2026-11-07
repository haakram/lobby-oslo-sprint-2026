import type { Metadata } from "next";
import { ComingSoon } from "@/ui";

export const metadata: Metadata = { title: "Stemme" };

// TODO(phase-2): the Stemme screen replaces this placeholder.
export default function Page() {
  return <ComingSoon title="Stemme" description="Snakk med Fettero på ditt eget språk." surface="light" />;
}
