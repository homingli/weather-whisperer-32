import { useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const NotFound = () => {
  // WCAG 2.4.4 / 2.4.6 — move focus to the heading on mount so screen-reader
  // users land in context ("404, page not found") instead of at the top of
  // the document with no signal that navigation succeeded.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1
          ref={headingRef}
          tabIndex={-1}
          // WCAG 2.4.7 — focus-visible:outline-none so the focus ring only
          // disappears for mouse users; keyboard users still see the outline.
          className="mb-4 text-4xl font-bold focus-visible:outline-none"
        >
          {t('notFound.code')}
        </h1>
        <p className="mb-4 text-xl text-muted-foreground">{t('notFound.title')}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t('notFound.returnHome')}
        </a>
      </div>
    </div>
  );
};

export default NotFound;