import React from 'react';

/**
 * زر "عرض المزيد" موحّد لقوائم الطلاب. يظهر الزر عندما توجد عناصر إضافية،
 * ويتحوّل إلى نص "تم عرض جميع الطلاب" عند عرض كل العناصر. يختفي تمامًا إذا كان
 * إجمالي العناصر أقل من أو يساوي `step` (لا حاجة لزر أصلًا).
 */
const ShowMoreButton = ({
  canShowMore,
  onShowMore,
  total,
  shown,
  step = 5,
  moreLabel = 'عرض المزيد',
  allShownLabel = 'تم عرض جميع الطلاب',
  testId = 'show-more-btn',
  className = '',
}) => {
  if (!total || total <= step) return null;

  return (
    <div className={`pt-3 flex items-center justify-center ${className}`}>
      {canShowMore ? (
        <button
          type="button"
          data-testid={testId}
          onClick={onShowMore}
          className="px-5 py-2 rounded-full text-xs font-plex bg-primary/10 text-primary hover:bg-primary/20 font-bold transition-colors"
        >
          {moreLabel}
          <span className="opacity-70 mr-1" dir="ltr">({shown} / {total})</span>
        </button>
      ) : (
        <p data-testid={`${testId}-all-shown`} className="text-xs font-plex text-muted-foreground">
          {allShownLabel}
        </p>
      )}
    </div>
  );
};

export default ShowMoreButton;
