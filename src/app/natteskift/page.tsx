import type { Metadata } from "next";
import { NightShiftScreen } from "@/features/nightshift/NightShiftScreen";

export const metadata: Metadata = {
  title: { absolute: "Natteskift | Lobby" },
  description: "Robotens natteskift: hotellet i 3D, klokken og hver beslutning.",
};

export default function Page() {
  // Not secret: the local viewer server's URL. Unset on the deployed app, which hides the Live tab.
  return <NightShiftScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />;
}
