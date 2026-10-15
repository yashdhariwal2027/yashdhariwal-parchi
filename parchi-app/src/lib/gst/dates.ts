/** Today's date in India as YYYY-MM-DD, whatever the device's time zone. */
export function todayIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60000);
  return ist.toISOString().slice(0, 10);
}

/** Financial year label (April to March): "2026-10-15" -> "26-27". Matches fy_label() in the database. */
export function fyLabel(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  const yy = (n: number) => String(n % 100).padStart(2, "0");
  return `${yy(start)}-${yy(start + 1)}`;
}

const DISPLAY = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** "2026-10-15" -> "15 Oct 2026" */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return DISPLAY.format(new Date(Date.UTC(y, m - 1, d)));
}
