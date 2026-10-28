/*
 * Microsoft Clarity (heatmaps and session recordings), loaded only on the live site and only when
 * VITE_CLARITY_PROJECT_ID is set in Cloudflare. The project ID is public; it already appears in
 * Clarity's own tracking snippet. Everything a signed-in seller sees is masked (see App.tsx), so
 * recordings never show invoices, customer details or business settings.
 */

/** Clarity project IDs are short lowercase letters and digits, e.g. "abc123xyz0". */
export function validClarityId(id: string | undefined): string | null {
  const v = (id ?? "").trim();
  return /^[a-z0-9]{6,20}$/.test(v) ? v : null;
}

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };

export function loadClarity(id: string | undefined, isProd: boolean, doc: Document = document): boolean {
  const projectId = validClarityId(id);
  if (!isProd || !projectId) return false;
  const w = doc.defaultView as (Window & { clarity?: ClarityFn }) | null;
  if (!w || w.clarity) return false;

  // Same queue-then-load pattern as Clarity's official snippet.
  const queue: ClarityFn = (...args: unknown[]) => {
    (queue.q = queue.q || []).push(args);
  };
  w.clarity = queue;

  const s = doc.createElement("script");
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${projectId}`;
  doc.head.appendChild(s);
  return true;
}
