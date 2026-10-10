import { Children, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { ReactNode } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperClass } from 'swiper';
import { Pagination } from 'swiper/modules';

export interface MobileSwiperDeckHandle {
  slideTo(index: number, speed?: number): void;
}

interface MobileSwiperDeckProps {
  children: ReactNode;
  /**
   * Widen the left margin of this bullet index (0-based) to carve a real
   * hole in the dot row — used by Index to seat the holiday chip between
   * bullets 2 and 3 without covering any clickable dot. The gap is a MARGIN
   * CLASS on the bullet itself, never a spacer child: Swiper resolves
   * clicked bullets by child index (elementIndex over parentNode.children),
   * so the container must hold bullets only. Undefined renders the plain
   * uniform row (non-HK cities, or badge hidden).
   */
  bulletGapAfterIndex?: number;
}

/**
 * Mobile-only horizontal swipe deck. Isolated in its own lazy chunk so
 * `swiper/react` + the Pagination module (~86 kB raw / ~27 kB gzip) stay out
 * of the initial bundle: Index renders this component only when the viewport
 * is at or below the mobile breakpoint, so desktop users never fetch it.
 *
 * Each child is one slide's CONTENT (not a <SwiperSlide>): swiper/react's
 * `getChildren` only collects SwiperSlide elements as slides, and Index must
 * not import SwiperSlide itself or the swiper module leaks back into the
 * main chunk. Wrapping happens here, the only module that imports swiper.
 *
 * The pagination bullets render OUTSIDE the swiper (into
 * #swiper-mobile-deck-pagination in Index) so they don't overlap the
 * rainfall map legend; the config below targets that external element.
 */
export const MobileSwiperDeck = forwardRef<MobileSwiperDeckHandle, MobileSwiperDeckProps>(
  function MobileSwiperDeck({ children, bulletGapAfterIndex }, ref) {
    const instanceRef = useRef<SwiperClass | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        slideTo: (index: number, speed?: number) => {
          instanceRef.current?.slideTo(index, speed);
        },
      }),
      [],
    );

    // Children.toArray flattens arrays and drops null/undefined/false, so a
    // conditional map slide (`{nowcastVisible && ...}`) disappears cleanly.
    const slides = Children.toArray(children);

    // renderBullet reads the gap through a ref so the pagination params can
    // stay referentially stable: swiper/react merges pagination params on
    // update WITHOUT re-rendering bullets, and a merge cannot delete a key
    // that the new params object omits — a conditionally-present renderBullet
    // would go stale. The effect re-renders the bullets when the gap
    // appears/disappears after mount (e.g. holidayCountdown resolving late
    // on a warm start); Swiper only rebuilds bullets on its own events or
    // this effect, both of which run after the ref is current.
    const gapRef = useRef(bulletGapAfterIndex);

    useEffect(() => {
      gapRef.current = bulletGapAfterIndex;
      const swiper = instanceRef.current;
      if (!swiper) return;
      swiper.pagination?.render();
      swiper.pagination?.update();
    }, [bulletGapAfterIndex]);

    return (
      <Swiper
        modules={[Pagination]}
        onSwiper={(instance) => {
          instanceRef.current = instance;
        }}
        pagination={{
          el: '#swiper-mobile-deck-pagination',
          clickable: true,
          renderBullet: (index: number, className: string) => {
            // The margin class goes on the bullet AFTER the gap (gap-after-1
            // ⇒ bullet 2 carries it), so bullets 2 and 3 flank the chip.
            const gapBullet = gapRef.current === undefined ? -1 : gapRef.current + 1;
            return index === gapBullet
              ? `<span class="${className} swiper-bullet-after-gap"></span>`
              : `<span class="${className}"></span>`;
          },
        }}
        spaceBetween={16}
        slidesPerView={1}
        className="swiper-mobile-deck"
        threshold={30}
        noSwipingClass="no-swipe"
      >
        {slides.map((slide, index) => (
          <SwiperSlide key={index}>{slide}</SwiperSlide>
        ))}
      </Swiper>
    );
  },
);
