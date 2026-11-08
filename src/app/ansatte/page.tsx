import type { Metadata } from "next";
import { StaffScreen } from "@/features/staff/StaffScreen";

export const metadata: Metadata = { title: "Ansatte og vakter" };

export default function Page() {
  return <StaffScreen />;
}
