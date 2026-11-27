import { z } from "zod";

/**
 * Zod 4 probes for `eval` to build faster validators. Our strict Content-Security-Policy forbids eval, so the probe
 * logs a policy violation (harmless, but noise). Turn the JIT off explicitly: validation behaves the same.
 */
z.config({ jitless: true });
