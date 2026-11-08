import type { Metadata } from "next";
import { InventoryScreen } from "@/features/inventory/InventoryScreen";

export const metadata: Metadata = { title: "Lager og lin" };

export default function Page() {
  return <InventoryScreen />;
}
