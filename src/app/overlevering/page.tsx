import type { Metadata } from "next";
import { HandoverScreen } from "@/features/handover/HandoverScreen";

export const metadata: Metadata = { title: "Overlevering 06:00" };

export default function Page() {
  // Not secret: the local viewer server's URL. Unset on the deployed app, which shows the demo night.
  return <HandoverScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />;
}
