import { memo, useEffect, useMemo, useState } from 'react';

/**
 * HolidayConfetti — the app's one easter egg visual: a short confetti
 * burst over the sky gradient. Each change of a nonzero `playKey` replays
 * the burst (Index sets it once on a real HK public holiday, and on every
 * desktop c-c-f-f konami); the layer hides itself until the next key.
 *
 * Pure CSS: ~30 absolutely-positioned spans animated by the `confetti-fall`
 * keyframes in index.css, which live inside the prefers-reduced-motion
 * no-preference block. The component additionally skips mounting for
 * reduce users via matchMedia, and the layer carries motion-reduce:hidden —
 * three independent guards for the same user preference. aria-hidden +
 * pointer-events-none keep the overlay purely decorative.
 */
const PARTICLE_COUNT = 30;
const PLAY_MS = 6000;
const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7'];

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const HolidayConfetti = memo(({ playKey }: HolidayConfettiProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (playKey === 0 || prefersReducedMotion()) return;
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), PLAY_MS);
    return () => window.clearTimeout(id);
  }, [playKey]);

  // Deterministic "scatter": no re-render churn, stable in tests, and a
  // fresh burst looks the same each time — good enough for a decoration.
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        left: `${(i * 37 + 3) % 100}%`,
        delay: `${((i * 13) % 20) / 10}s`,
        duration: `${2.5 + ((i * 7) % 15) / 10}s`,
        color: COLORS[i % COLORS.length],
        width: 5 + (i % 3) * 2,
      })),
    [],
  );

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden motion-reduce:hidden"
      aria-hidden="true"
    >
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute block rounded-[1px]"
          style={{
            top: -12,
            left: p.left,
            width: p.width,
            height: p.width * 0.6,
            backgroundColor: p.color,
            animation: `confetti-fall ${p.duration} ease-in ${p.delay} both`,
          }}
        />
      ))}
    </div>
  );
});

HolidayConfetti.displayName = 'HolidayConfetti';

interface HolidayConfettiProps {
  /** Increment to (re)play the burst; 0 or unchanged keeps it hidden. */
  playKey: number;
}
