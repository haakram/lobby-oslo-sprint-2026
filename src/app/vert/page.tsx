import type { Metadata } from "next";
import { HostOverview } from "@/features/host/HostOverview";

export const metadata: Metadata = { title: "Mine boliger" };

export default function Page() {
  return <HostOverview />;
}
