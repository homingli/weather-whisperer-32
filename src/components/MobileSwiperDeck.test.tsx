import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MobileSwiperDeck } from './MobileSwiperDeck';

import type { RefObject } from 'react';
import type { MobileSwiperDeckHandle } from './MobileSwiperDeck';

/**
 * The deck is mobile-only (Index gates it behind useIsMobile, which is false
 * under jsdom), so these tests render the deck directly with the same shape
 * of children Index passes: forecast panes plus a conditional map child.
 * The pagination bullets render into the EXTERNAL element Index owns
 * (#swiper-mobile-deck-pagination); include it so swiper's Pagination module
 * has its render target.
 */
function DeckHarness({
  deckRef,
  withMap,
  bulletGapAfterIndex,
}: {
  deckRef: RefObject<MobileSwiperDeckHandle | null>;
  withMap: boolean;
  bulletGapAfterIndex?: number;
}) {
  return (
    <div>
      <MobileSwiperDeck ref={deckRef} bulletGapAfterIndex={bulletGapAfterIndex}>
        <div>hero</div>
        <div>hourly</div>
        <div>daily</div>
        {withMap && <div>map</div>}
      </MobileSwiperDeck>
      <div id="swiper-mobile-deck-pagination" />
    </div>
  );
}

const slides = (container: HTMLElement) => Array.from(container.querySelectorAll('.swiper-slide'));

// jsdom does no layout, so every element measures 0 and swiper collapses all
// snap points into one (single bullet). Fake fixed dimensions so swiper
// computes one snap point per slide, matching a real 390 px viewport.
const originalDims = ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight'].map(
  (prop) => [prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)] as const,
);

beforeEach(() => {
  const dims = { offsetWidth: 390, offsetHeight: 640, clientWidth: 390, clientHeight: 640 };
  for (const [prop, value] of Object.entries(dims)) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, value });
  }
});

afterEach(() => {
  for (const [prop, descriptor] of originalDims) {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, prop, descriptor);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
    }
  }
});

describe('MobileSwiperDeck', () => {
  it('renders one slide per non-null child and one pagination bullet per slide', async () => {
    const deckRef = createRef<MobileSwiperDeckHandle>();
    const { container } = render(<DeckHarness deckRef={deckRef} withMap={false} />);

    await waitFor(() => {
      expect(slides(container)).toHaveLength(3);
      expect(
        container.querySelectorAll('#swiper-mobile-deck-pagination .swiper-pagination-bullet'),
      ).toHaveLength(3);
    });
  });

  it('slideTo activates the requested slide', async () => {
    const deckRef = createRef<MobileSwiperDeckHandle>();
    const { container } = render(<DeckHarness deckRef={deckRef} withMap={true} />);

    await waitFor(() => {
      expect(slides(container)).toHaveLength(4);
    });

    act(() => {
      deckRef.current?.slideTo(2);
    });

    await waitFor(() => {
      expect(slides(container)[2]).toHaveClass('swiper-slide-active');
      expect(slides(container)[2].textContent).toBe('daily');
    });
  });

  it('bullet gap marks the bullet after the gap and adds no extra container child', async () => {
    // Swiper resolves clicked bullets by CHILD INDEX (elementIndex over
    // parentNode.children), so the hole must be a margin on a bullet, never
    // a spacer element that would shift dot→slide mapping.
    const deckRef = createRef<MobileSwiperDeckHandle>();
    const { container } = render(
      <DeckHarness deckRef={deckRef} withMap={true} bulletGapAfterIndex={1} />,
    );

    await waitFor(() => {
      expect(
        container.querySelectorAll('#swiper-mobile-deck-pagination .swiper-pagination-bullet'),
      ).toHaveLength(4);
    });

    const row = container.querySelector('#swiper-mobile-deck-pagination')!;
    const bullets = [...row.querySelectorAll('.swiper-pagination-bullet')];
    // Gap after index 1 ⇒ bullet 2 carries the margin class…
    expect(bullets[2]).toHaveClass('swiper-bullet-after-gap');
    expect(bullets[0]).not.toHaveClass('swiper-bullet-after-gap');
    // …and the container holds bullets ONLY (children count === bullet count).
    expect(row.children).toHaveLength(bullets.length);
  });
});
