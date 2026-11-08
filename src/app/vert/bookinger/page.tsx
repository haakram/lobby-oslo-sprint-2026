import type { Metadata } from "next";
import { HostBookings } from "@/features/host/HostBookings";

export const metadata: Metadata = { title: "Bookinger og inntekt" };

export default function Page() {
  return <HostBookings />;
}
