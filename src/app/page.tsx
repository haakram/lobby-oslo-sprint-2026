import type { Metadata } from "next";
import { DashboardScreen } from "@/features/dashboard/DashboardScreen";

export const metadata: Metadata = { title: "Oversikt" };

export default function Home() {
  // Not secret: the local viewer server's URL. Unset on the deployed app, which shows the demo night.
  return <DashboardScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />;
}
