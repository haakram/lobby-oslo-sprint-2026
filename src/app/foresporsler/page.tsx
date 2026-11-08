import type { Metadata } from "next";
import { RequestsScreen } from "@/features/requests/RequestsScreen";

export const metadata: Metadata = { title: "Forespørsler" };

export default function Page() {
  return <RequestsScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />;
}
