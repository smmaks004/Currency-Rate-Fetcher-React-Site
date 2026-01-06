// Small date helper utilities shared across the app

export function pad2(n) {
  return String(n).padStart(2, '0');
}

// Parse various date inputs into a local Date object or null
export function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const s = String(value);
  // YYYY-MM-DD -> local date (no timezone shift)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// Format a date as YYYY-MM-DD using local timezone
export function formatDateLocal(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : parseDate(d);
  if (!dt) return '';
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

// Convert a millisecond UTC timestamp into YYYY-MM-DD (UTC) key
export function keyFromTimestampUTC(ts) {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}`;
}

// Create YYYY-MM-DD key from a Date or parsable value (local date)
export function dateKeyFromDate(d) {
  const dt = d instanceof Date ? d : parseDate(d);
  if (!dt) return '';
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
