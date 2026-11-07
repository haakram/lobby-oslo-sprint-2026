import type { NextRequest } from "next/server";
import { handleView } from "@/features/auth/handlers";

export const dynamic = "force-dynamic";

/** Admins only: { view: "admin" | "receptionist" | "robot" } re-signs the cookie with that view. */
export function POST(request: NextRequest) {
  return handleView(request);
}
