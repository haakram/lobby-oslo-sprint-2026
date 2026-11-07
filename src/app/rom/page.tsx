import type { Metadata } from "next";
import { RoomsScreen } from "@/features/rooms/RoomsScreen";

export const metadata: Metadata = { title: "Rom og renhold" };

export default function Page() {
  // Not secret: the local viewer server's URL. Unset on the deployed app, which shows the demo night.
  return <RoomsScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />;
}
