import type { NextRequest } from "next/server";
import { handleLogout } from "@/features/auth/handlers";

export const dynamic = "force-dynamic";

/** Clears the session cookie. */
export function POST(request: NextRequest) {
  return handleLogout(request);
}
