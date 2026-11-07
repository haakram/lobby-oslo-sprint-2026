import type { Metadata } from "next";
import { GuestsScreen } from "@/features/guests/GuestsScreen";

export const metadata: Metadata = { title: "Gjester og bookinger" };

export default function Page() {
  return <GuestsScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />;
}
