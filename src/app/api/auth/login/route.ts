import type { NextRequest } from "next/server";
import { handleLogin } from "@/features/auth/handlers";

export const dynamic = "force-dynamic";

/** Username + password in, signed session cookie out. Logic and tests: src/features/auth/handlers.ts. */
export function POST(request: NextRequest) {
  return handleLogin(request);
}
