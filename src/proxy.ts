import { NextResponse, type NextRequest } from "next/server";
import { decide } from "@/features/auth/access";
import { resolveSession } from "@/features/auth/resolve";
import { SESSION_COOKIE, sessionCookieOptions } from "@/features/auth/session";

// Next 16 "proxy" (formerly middleware); runs on the Node.js runtime before every route.
// Who may open what lives in src/features/auth/roles.ts; the decision itself in access.ts.

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function proxy(request: NextRequest): NextResponse {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = resolveSession(token);
  const decision = decide({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    session: session && { role: session.user.role, view: session.view },
    hadCookie: Boolean(token),
  });

  switch (decision.kind) {
    case "next":
      return NextResponse.next();
    case "redirect": {
      const response = NextResponse.redirect(new URL(decision.location, request.url));
      if (decision.clearCookie) response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
      return response;
    }
    case "unauthorized":
      return NextResponse.json({ error: "Ikke innlogget." }, { status: 401, headers: NO_STORE });
    case "forbidden":
      return decision.api
        ? NextResponse.json({ error: "Ingen tilgang." }, { status: 403, headers: NO_STORE })
        : NextResponse.rewrite(new URL("/login/ingen-tilgang", request.url), { status: 403, headers: NO_STORE });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
