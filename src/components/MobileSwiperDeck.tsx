import { Children, forwardRef, useImperativeHandle, useRef } from 'react';
import type { ReactNode } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';

export interface MobileSwiperDeckHandle {
  slideTo(index: number, speed?: number): void;
}

interface MobileSwiperDeckProps {
  children: ReactNode;
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
  function MobileSwiperDeck({ children }, ref) {
    const instanceRef = useRef<{ slideTo(index: number, speed?: number): void } | null>(null);

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

    return (
      <Swiper
        modules={[Pagination]}
        onSwiper={(instance) => {
          instanceRef.current = instance;
        }}
        pagination={{ el: '#swiper-mobile-deck-pagination', clickable: true }}
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
