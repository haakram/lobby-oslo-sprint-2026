import type { NextRequest } from "next/server";
import { handleSession } from "@/features/auth/handlers";

export const dynamic = "force-dynamic";

/** The current session: { session: { user, view, effectiveRole, exp } }, or 401. */
export function GET(request: NextRequest) {
  return handleSession(request);
}
