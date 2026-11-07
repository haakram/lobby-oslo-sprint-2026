import type { Metadata } from "next";
import { ComingSoon } from "@/ui";

export const metadata: Metadata = { title: "Øyne" };

// TODO(phase-2): the Øyne screen replaces this placeholder.
export default function Page() {
  return <ComingSoon title="Øyne" description="Kjenn igjen varer med kameraet, uten strekkode." surface="dark" />;
}
