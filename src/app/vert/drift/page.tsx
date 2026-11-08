import type { Metadata } from "next";
import { HostSupplies } from "@/features/host/HostSupplies";

export const metadata: Metadata = { title: "Forsyninger og vedlikehold" };

export default function Page() {
  return <HostSupplies />;
}
