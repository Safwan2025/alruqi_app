import { useState, useEffect, useMemo } from 'react';

/**
 * useShowMoreList — يعرض أول `step` عناصر من القائمة، ويزيد `step` عناصر مع كل
 * استدعاء لـ showMore. يُعيد العدد المعروض إلى `step` تلقائيًا عند تغيّر `resetKey`
 * (مثل نص البحث أو قيمة الفلتر) حتى يبدأ العرض من 5 من جديد.
 *
 * مرّر القائمة المفلترة مباشرة. لا يقوم الـ hook بأي فلترة بنفسه.
 *
 * @param {Array} items القائمة (يُفضّل أن تكون مفلترة مسبقًا)
 * @param {number} step عدد العناصر في كل دفعة (افتراضي 5)
 * @param {*} resetKey أي قيمة عند تغيّرها يُعاد العدد إلى step (البحث/الفلتر)
 */
export default function useShowMoreList(items, step = 5, resetKey = '') {
  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const [count, setCount] = useState(step);

  useEffect(() => {
    setCount(step);
  }, [resetKey, step]);

  const visible = useMemo(() => list.slice(0, count), [list, count]);
  const total = list.length;
  const shown = Math.min(count, total);
  const canShowMore = count < total;
  const showMore = () => setCount((c) => c + step);

  return { visible, canShowMore, showMore, total, shown };
}
