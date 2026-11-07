import type { Metadata } from "next";
import { EyesScreen } from "@/features/eyes/EyesScreen";

export const metadata: Metadata = { title: "Øyne" };

export default function Page() {
  return <EyesScreen />;
}
