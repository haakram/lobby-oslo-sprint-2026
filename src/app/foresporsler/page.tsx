import type { Metadata } from "next";
import { RequestsScreen, sourceFromQuery } from "@/features/requests/RequestsScreen";

export const metadata: Metadata = { title: "Forespørsler" };

/** `?filter=robot` opens the list on the robot's requests (Overlevering's hand-back item links there). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { filter } = await searchParams;
  return <RequestsScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} initialSource={sourceFromQuery(filter)} />;
}
