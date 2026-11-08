import type { Metadata } from "next";
import { RoomsScreen } from "@/features/rooms/RoomsScreen";

export const metadata: Metadata = { title: "Rom og renhold" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // `?rom=room-201` (a tile on Oversikt) opens that room's night.
  const { rom } = await searchParams;
  // Not secret: the local viewer server's URL. Unset on the deployed app, which shows the demo night.
  return <RoomsScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} initialRoom={typeof rom === "string" ? rom : null} />;
}
