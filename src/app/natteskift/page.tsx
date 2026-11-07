import type { Metadata } from "next";
import { ComingSoon } from "@/ui";

export const metadata: Metadata = { title: "Natteskift" };

// TODO(phase-2): the Natteskift screen replaces this placeholder.
export default function Page() {
  return <ComingSoon title="Natteskift" description="Robotens skift i natt, steg for steg." surface="dark" />;
}
