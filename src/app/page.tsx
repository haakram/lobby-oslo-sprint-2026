import type { Metadata } from "next";
import { DashboardScreen } from "@/features/dashboard/DashboardScreen";
import { APP_NAME } from "@/ui/brand";

// The layout's title template covers only the pages below it, not the home page beside it.
export const metadata: Metadata = { title: `Oversikt | ${APP_NAME}` };

export default function Home() {
  // Not secret: the local viewer server's URL. Unset on the deployed app, which shows the demo night.
  return <DashboardScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />;
}
