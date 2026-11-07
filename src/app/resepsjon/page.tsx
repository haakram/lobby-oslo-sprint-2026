import type { Metadata } from "next";
import { ReceptionScreen } from "@/features/reception/ReceptionScreen";

export const metadata: Metadata = { title: "Resepsjon" };

export default function Page() {
  return <ReceptionScreen />;
}
