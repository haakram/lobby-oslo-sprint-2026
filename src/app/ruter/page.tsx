import type { Metadata } from "next";
import { RoutesScreen, type RouteParams } from "@/features/routes/RoutesScreen";

export const metadata: Metadata = { title: "Ruter" };

const KEYS = ["modus", "rom", "start", "vogn", "sku"] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params: RouteParams = {};
  for (const key of KEYS) {
    const value = raw[key];
    if (value !== undefined) params[key] = value;
  }
  // A new link (e.g. the dashboard's "Send renholderne") starts a fresh plan.
  return <RoutesScreen key={JSON.stringify(params)} params={params} />;
}
