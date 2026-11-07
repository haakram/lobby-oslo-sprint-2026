import type { Metadata } from "next";
import { RoutesScreen } from "@/features/routes/RoutesScreen";

export const metadata: Metadata = { title: "Ruter" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sku } = await searchParams;
  return <RoutesScreen addSku={typeof sku === "string" ? sku : undefined} />;
}
