/*
 * One web address for the whole site. Sign-ins are saved per address, so "www.yourdomain.com" and
 * "yourdomain.com" would otherwise sign people out when they switch. Visitors to www. are sent to the
 * address without it, keeping the page they asked for.
 */
export function canonicalUrl(href: string): string | null {
  const u = new URL(href);
  if (!u.hostname.startsWith("www.")) return null;
  u.hostname = u.hostname.slice(4);
  return u.toString();
}
