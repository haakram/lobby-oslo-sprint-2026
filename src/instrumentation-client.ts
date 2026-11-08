import { z } from "zod";

// Runs in the browser before the app's own code (Next.js instrumentation-client). Zod builds its fast
// parsers with new Function() and probes for it first; the CSP (next.config.ts) allows no eval in
// production, so the probe alone would log a CSP violation on every page. Without the JIT, zod parses the
// same way, only a little slower. The server is not affected.
z.config({ jitless: true });
