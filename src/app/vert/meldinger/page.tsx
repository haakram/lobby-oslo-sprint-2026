import type { Metadata } from "next";
import { HostMessages } from "@/features/host/HostMessages";

export const metadata: Metadata = { title: "Gjestemeldinger" };

export default function Page() {
  return <HostMessages />;
}
