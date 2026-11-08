/**
 * MediaPipe's detector reports its own usage to Google (a POST to odml.pa.googleapis.com/v1/log each
 * minute and when it closes), with no option to turn it off. The CSP's connect-src already refuses it
 * (next.config.ts), but a refused request still logs a CSP error in the console. This answers that one
 * host on the phone instead, before any request exists: MediaPipe reads the 204 as a failed send and stops
 * logging. Every other request goes to the real fetch untouched; the CSP stays the backstop.
 */
const TELEMETRY_ORIGIN = "https://odml.pa.googleapis.com";
const WRAPPED = Symbol.for("fettero.noMediaPipeTelemetry");

type FetchHost = { fetch: typeof fetch };

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Wraps `host.fetch` once (idempotent) so requests to MediaPipe's telemetry never leave the device. */
export function blockMediaPipeTelemetry(host: FetchHost = globalThis): void {
  const current = host.fetch as typeof fetch & { [WRAPPED]?: true };
  if (typeof current !== "function" || current[WRAPPED]) return;
  const wrapped = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
      let url: string;
      try {
        url = new URL(urlOf(input), "http://localhost").origin;
      } catch {
        return current.call(host, input, init);
      }
      if (url === TELEMETRY_ORIGIN) return Promise.resolve(new Response(null, { status: 204 }));
      return current.call(host, input, init);
    },
    { [WRAPPED]: true as const },
  );
  host.fetch = wrapped;
}
