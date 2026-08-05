import type { ReactNode } from 'react';

/**
 * Recharts mock prop shape for the test files that mock recharts (`Hourly`
 * + `Daily` forecast tests). Recharts' real prop types include refs and
 * configuration callbacks we don't model, so the index signature catches
 * everything else; `children` is explicit so JSX gets the ReactNode type
 * the renderers expect.
 */
export type MockChartProps = {
  children?: ReactNode;
  [k: string]: unknown;
};
