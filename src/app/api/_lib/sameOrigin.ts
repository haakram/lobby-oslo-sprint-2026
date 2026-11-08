import { isSameOrigin } from "@/features/auth/handlers";

/**
 * The second layer on the data and paid routes (round 4, security review): the proxy already turns away
 * anyone without a session, and the session cookie is `SameSite=Lax`, so a real cross-site request
 * never carries it. This checks the request itself too, with the same rule the auth POSTs use
 * (`isSameOrigin`): a browser on another site (`Sec-Fetch-Site: cross-site` or `same-site`, or an
 * `Origin` that isn't this host) is answered 403 before any limit is counted or any backend is reached.
 * A tool without those headers (curl, a test) passes, as on the auth routes; the session still decides.
 */

export const CROSS_SITE_COPY = "Ikke tillatt.";

/** The 403 to send for a request from another site, or null to go ahead. */
export function refuseCrossSite(request: Request): Response | null {
  if (isSameOrigin(request)) return null;
  return Response.json(
    { error: CROSS_SITE_COPY, code: "cross_site" },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
