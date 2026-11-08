import type { Metadata } from "next";
import { MaintenanceScreen } from "@/features/maintenance/MaintenanceScreen";

export const metadata: Metadata = { title: "Vedlikehold" };

export default function Page() {
  return <MaintenanceScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />;
}
