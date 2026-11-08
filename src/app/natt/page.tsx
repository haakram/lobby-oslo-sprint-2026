import type { Metadata } from "next";
import { NightClerkScreen } from "@/features/staffinput/NightClerkScreen";

export const metadata: Metadata = {
  title: "Nattevaktens logg",
  description: "Nattevaktens rom, farer og notater, rett inn i overleveringen kl. 06:00.",
};

export default function Page() {
  // Not secret: the local viewer server's URL. Unset on the deployed app, which shows the demo night's hotel.
  return <NightClerkScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />;
}
