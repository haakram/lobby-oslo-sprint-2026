/**
 * Keeps the Ruter screen's choices in the address bar (no navigation, no history entry), so a
 * reload or a shared link opens the same route. Commas stay readable: ?rom=room-201,room-214.
 */
export function replaceQuery(updates: Record<string, string | null>): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  const search = url.searchParams.toString().replace(/%2C/gi, ",");
  window.history.replaceState(null, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
}
