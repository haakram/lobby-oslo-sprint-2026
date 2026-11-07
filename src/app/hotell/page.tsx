import type { Metadata } from "next";
import { HotelScreen } from "@/features/hotel3d/HotelScreen";

export const metadata: Metadata = {
  title: { absolute: "Hotell | Lobby" },
  description: "Hele hotellet i 3D: romstatus og roboten der den går, natten gjennom.",
};

export default function Page() {
  // Not secret: the local viewer server's URL. Unset means the local default, probed only on localhost.
  return <HotelScreen viewerUrl={process.env.NEXT_PUBLIC_VIEWER_URL} />;
}
