/**
 * Always display the supervisor / signer as "الشيخ {name}".
 * - Falls back to the canonical name if none provided.
 * - Idempotent: never prepends "الشيخ" twice.
 */
const DEFAULT_NAME = 'محمد حامد الأنصاري';
const PREFIX = 'الشيخ';

export const formatSupervisorName = (raw) => {
  const cleaned = (raw || '').trim();
  const base = cleaned || DEFAULT_NAME;
  if (base.startsWith(PREFIX)) return base;
  return `${PREFIX} ${base}`;
};

export default formatSupervisorName;
