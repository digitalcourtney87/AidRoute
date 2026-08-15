const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Store dates are YYYY-MM or YYYY-MM-DD; anything else renders as-is.
export function formatStoreDate(value: string): string {
  const full = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) {
    return `${Number(full[3])} ${MONTHS[Number(full[2]) - 1]} ${full[1]}`;
  }
  const monthOnly = value.match(/^(\d{4})-(\d{2})$/);
  if (monthOnly) {
    return `${MONTHS[Number(monthOnly[2]) - 1]} ${monthOnly[1]}`;
  }
  return value;
}
