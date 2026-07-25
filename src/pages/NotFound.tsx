import { useEffect, useRef } from 'react';

const NotFound = () => {
  // WCAG 2.4.4 / 2.4.6 — move focus to the heading on mount so screen-reader
  // users land in context ("404, page not found") instead of at the top of
  // the document with no signal that navigation succeeded.
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mb-4 text-4xl font-bold focus:outline-none"
        >
          404
        </h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;