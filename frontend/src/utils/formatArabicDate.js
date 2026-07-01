/**
 * Arabic date formatting helpers (locale `ar-EG`).
 *
 * Centralises the `fmtDate` / `formatDate` snippets that were duplicated
 * across PDF generators and dashboard components. Behaviour is preserved
 * exactly — callers may pass `'short'` or `'long'` for the month style
 * matching whatever the original component used.
 *
 *   import { formatArabicDate } from '@/utils/formatArabicDate';
 *   formatArabicDate(iso)              // long month — e.g. "١٢ فبراير ٢٠٢٦"
 *   formatArabicDate(iso, 'short')     // short month — e.g. "١٢ فبر. ٢٠٢٦"
 *   formatArabicDateTime(iso)          // date + time
 */

const DEFAULT_FALLBACK = '—';

/**
 * Format an ISO date string as a localised Arabic date.
 *
 * @param {string|Date|null|undefined} iso  The value to format.
 * @param {'long'|'short'|'numeric'|'2-digit'|'narrow'} [monthStyle='long']
 * @param {string} [fallback='—']  Returned when `iso` is falsy.
 * @returns {string}  Formatted date, or the original input on parse error.
 */
export const formatArabicDate = (iso, monthStyle = 'long', fallback = DEFAULT_FALLBACK) => {
  if (!iso) return fallback;
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: monthStyle,
      day: 'numeric',
    });
  } catch {
    return iso;
  }
};

/**
 * Same as `formatArabicDate` but additionally includes hours:minutes.
 */
export const formatArabicDateTime = (iso, monthStyle = 'short', fallback = DEFAULT_FALLBACK) => {
  if (!iso) return fallback;
  try {
    return new Date(iso).toLocaleString('ar-EG', {
      year: 'numeric',
      month: monthStyle,
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export default formatArabicDate;
