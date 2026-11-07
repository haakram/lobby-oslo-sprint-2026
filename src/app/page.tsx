import type { Metadata } from "next";
import { HomeByRole } from "@/features/dashboard/HomeByRole";

export const metadata: Metadata = { title: "Oversikt" };

export default function Home() {
  // Not secret: the local viewer server's URL. Unset on the deployed app, which shows the demo night.
  return <HomeByRole viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />;
}
