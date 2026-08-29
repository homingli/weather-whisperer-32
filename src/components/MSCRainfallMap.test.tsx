// Tests for the MSC (Vancouver) nowcast map. The real Leaflet map can't
// mount in jsdom, so react-leaflet is stubbed: MapContainer forwards a stub
// map instance (mirroring the HKO RainfallMap test), TileLayer exposes its
// url for the basemap-toggle assertion, and WMSTileLayer fires the loading/
// load event handlers (like real Leaflet tile batches) and exposes the
// active step's `time` param.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef, useImperativeHandle, useEffect } from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MSCRainfallMap } from './MSCRainfallMap';
import MSCRainfallMapInner from './MSCRainfallMapInner';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { formatStepTime } from '@/lib/msc-wms';
import { cartoRasterUrl } from '@/lib/carto';
import { ThemeProvider } from '@/contexts/ThemeContext';

// Controls whether the mocked WMS tile batch simulates a fully-failed load
// (tileerror × N then load — mirroring Leaflet, which fires 'load' even when
// every tile errored). vi.hoisted so the vi.mock factory can read it.
const failTileBatch = vi.hoisted(() => ({ value: false }));

// Test hooks: the stub map instance (for lock-state assertions) and the
// WMSTileLayer's event handlers (to fire synthetic tile batches).
const mapTestHooks = vi.hoisted(() => ({
  stubMap: null as unknown as {
    dragging: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  },
  tileHandlers: null as unknown as { loading?: () => void; load?: () => void; tileerror?: () => void },
}));

// Everything the mock factory references must live inside the factory or be
// an import (vi.mock is hoisted above top-level consts — a TDZ ReferenceError
// otherwise). The HKO test gets away with top-level stubs because its inner
// component is only lazy-imported after the test body runs; this file imports
// MSCRainfallMapInner eagerly, so the factory executes before consts init.
vi.mock('react-leaflet', () => {
  const stubMap: Record<string, unknown> = {
    setView: () => {},
    fitBounds: () => {},
    invalidateSize: () => {},
    getContainer: () => document.createElement('div'),
    dragging: { enable: vi.fn(), disable: vi.fn() },
    scrollWheelZoom: { enable: vi.fn(), disable: vi.fn() },
    doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
    touchZoom: { enable: vi.fn(), disable: vi.fn() },
    boxZoom: { enable: vi.fn(), disable: vi.fn() },
    keyboard: { enable: vi.fn(), disable: vi.fn() },
  };
  mapTestHooks.stubMap = stubMap as never;

  const MapContainerStub = forwardRef<unknown, { children?: React.ReactNode }>(
    function MapContainerStub(props, ref) {
      useImperativeHandle(ref, () => stubMap, []);
      return <div data-testid="map-container">{props.children}</div>;
    },
  );

  return {
    MapContainer: MapContainerStub,
    TileLayer: ({ url }: { url: string }) => <div data-testid="tile-layer" data-url={url} />,
    ZoomControl: () => <div data-testid="zoom-control" />,
    Marker: () => <div data-testid="marker" />,
    WMSTileLayer: ({
      params,
      eventHandlers,
    }: {
      params: { time?: string };
      eventHandlers?: { loading?: () => void; load?: () => void; tileerror?: () => void };
    }) => {
      // Simulate a real Leaflet tile batch: 'loading' fires, then 'load'
      // after a microtask-ish delay. jsdom can't render actual tiles, so the
      // stub renders a test hook carrying the active step's TIME param.
      useEffect(() => {
        mapTestHooks.tileHandlers = eventHandlers as never;
        eventHandlers?.loading?.();
        const id = setTimeout(() => {
          if (failTileBatch.value) {
            // Fully-failed batch: every tile errors, then Leaflet fires
            // 'load' (errored tiles count as loaded in _noTilesToLoad).
            eventHandlers?.tileerror?.();
            eventHandlers?.tileerror?.();
          }
          eventHandlers?.load?.();
        }, 0);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <div data-testid="wms-layer" data-time={params?.time ?? ''} />;
    },
  };
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <LanguageProvider>{ui}</LanguageProvider>
    </ThemeProvider>,
  );
}

/** The 6 step-label buttons (HH:MM) once the inner map has "loaded" tiles. */
async function stepButtons(): Promise<HTMLElement[]> {
  await waitFor(() => {
    expect(screen.getAllByRole('button').length).toBeGreaterThan(5);
  });
  const labels = screen
    .getAllByRole('button')
    .filter((b) => /^\d{2}:\d{2}$/.test(b.textContent ?? ''));
  expect(labels).toHaveLength(6);
  return labels;
}

describe('MSCRainfallMap (outer)', () => {
  it('auto-loads the map without a "Load Map" prompt', async () => {
    // MSC serves small cached WMS tiles (not a 2.7 MB CSV), so the map loads
    // as soon as the section renders — no explicit opt-in prompt (user
    // decision 2026-08-07, FR-001).
    renderWithProviders(<MSCRainfallMap />);
    expect(screen.getByText('Rain Cloud Nowcast')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load Map/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });
});

describe('MSCRainfallMapInner', () => {
  beforeEach(() => {
    vi.useRealTimers();
    failTileBatch.value = false;
  });

  it('renders the map with 6 forecast steps after tiles load', async () => {
    renderWithProviders(<MSCRainfallMapInner />);
    const labels = await stepButtons();
    // 6 steps = forecast hours 1h..6h of the latest published run.
    expect(labels).toHaveLength(6);
    expect(screen.getByTestId('wms-layer')).toBeInTheDocument();
  });

  it('shows the retry overlay when the first tile batch fails entirely, then recovers on retry', async () => {
    // Regression for review Issue 1 (FR-008): Leaflet fires 'load' even when
    // every tile errored, so the old handler rendered a blank map with no
    // error overlay on a dead network. A first batch with any errors must
    // show the retry overlay instead.
    failTileBatch.value = true;
    try {
      renderWithProviders(<MSCRainfallMapInner />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load data')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();

      // Retry with a healthy batch → overlay clears, map + step controls render.
      failTileBatch.value = false;
      fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));

      await waitFor(() => {
        expect(screen.queryByText('Failed to load data')).not.toBeInTheDocument();
      });
      await stepButtons();
    } finally {
      failTileBatch.value = false;
    }
  });

  it('switches the WMS TIME param when the active step changes', async () => {
    renderWithProviders(<MSCRainfallMapInner />);
    const labels = await stepButtons();

    const layer = () => screen.getByTestId('wms-layer');
    const firstTime = layer().getAttribute('data-time') ?? '';
    // WMS time is a strict MapServer UTC instant, independent of the display zone.
    expect(firstTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/);
    // The first step button renders that instant in Vancouver local time.
    expect(labels[0].textContent).toBe(formatStepTime(firstTime));

    // Click the 4th step label — the WMS layer must re-request that TIME.
    fireEvent.click(labels[3]);
    await waitFor(() => {
      const t = layer().getAttribute('data-time') ?? '';
      expect(t).not.toBe(firstTime);
      expect(t).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/);
      expect(labels[3].textContent).toBe(formatStepTime(t));
    });
  });

  it('autoplay cycles through the forecast steps', async () => {
    // Render + wait for tiles to "load" with REAL timers first — stepButtons
    // polls with waitFor, which hangs under fake timers. Fake timers are
    // only enabled after the map is up, to drive the autoplay interval.
    renderWithProviders(<MSCRainfallMapInner />);
    const labels = await stepButtons();
    const before = screen.getByTestId('wms-layer').getAttribute('data-time');

    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      fireEvent.click(screen.getByRole('button', { name: /Play timeline/i }));

      // Advance ~3 autoplay ticks (RAINFALL_AUTOPLAY_MS = 1500).
      await vi.advanceTimersByTimeAsync(1500 * 3 + 50);

      const after = screen.getByTestId('wms-layer').getAttribute('data-time');
      expect(after).not.toBe(before);
      // Wrapped within the 6 steps — the new time (rendered in Vancouver
      // local time) is one of the step button labels.
      expect(labels.map((l) => l.textContent)).toContain(after ? formatStepTime(after) : '');
    } finally {
      vi.useRealTimers();
    }
  });

  it('toggles the basemap between light and dark tiles', async () => {
    renderWithProviders(<MSCRainfallMapInner />);
    await stepButtons();

    const lightUrl = cartoRasterUrl('light_all');
    const darkUrl = cartoRasterUrl('dark_all');
    expect(screen.getByTestId('tile-layer').getAttribute('data-url')).toBe(lightUrl);

    fireEvent.click(screen.getByRole('button', { name: /Switch basemap/i }));
    await waitFor(() => {
      expect(screen.getByTestId('tile-layer').getAttribute('data-url')).toBe(darkUrl);
    });

    fireEvent.click(screen.getByRole('button', { name: /Switch basemap/i }));
    await waitFor(() => {
      expect(screen.getByTestId('tile-layer').getAttribute('data-url')).toBe(lightUrl);
    });
  });

  it('renders the compact intensity legend once tiles have loaded', async () => {
    renderWithProviders(<MSCRainfallMapInner />);
    await stepButtons();

    expect(screen.getByText('Precipitation intensity')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows the "using last analysis" chip when the run is older than 6h', async () => {
    // Freeze the clock just past a run's 6h validity window: at 18:30Z the
    // latest published run is 12Z (6.5h old) → chip must show. Fake timers
    // auto-advance so waitFor (used by stepButtons) still polls.
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-08-06T18:30:00Z') });
    try {
      renderWithProviders(<MSCRainfallMapInner />);
      await stepButtons();
      expect(screen.getByText(/Using last analysis at 05:00/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the map lock after the first load and never re-locks on later tile batches', async () => {
    // Regression: the lock was keyed on tileLoading, so every pan/zoom tile
    // batch ('loading' → applyMapLockState identity change → ref re-fire)
    // disabled dragging again — the map became immovable after the first pan.
    renderWithProviders(<MSCRainfallMapInner />);
    await stepButtons(); // first batch loaded → hasLoadedOnce, map unlocked

    expect(mapTestHooks.stubMap.dragging.enable).toHaveBeenCalled();
    const disableCountAfterLoad = mapTestHooks.stubMap.dragging.disable.mock.calls.length;

    // Simulate a pan-triggered tile batch — must NOT re-lock.
    act(() => {
      mapTestHooks.tileHandlers?.loading?.();
      mapTestHooks.tileHandlers?.load?.();
    });

    expect(mapTestHooks.stubMap.dragging.disable.mock.calls.length).toBe(disableCountAfterLoad);
  });

  it('recomputes the run when the next HRDPS cycle becomes publishable', async () => {
    // Regression for review issue 4: steps were frozen at mount. Mount at
    // 07:30Z (00Z run selected, steps 08:00..13:00Z); at 08:00Z the 06Z run
    // becomes publishable (cycle start + 2h lag) and the map must switch to
    // its steps (09:00..14:00Z).
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-08-06T07:30:00Z') });
    try {
      renderWithProviders(<MSCRainfallMapInner />);
      await stepButtons();

      // 00Z run: observation time (PDT = UTC-7) and last step label (13:00Z -> 06:00 PDT).
      expect(screen.getByText('Updated: 2026-08-05 17:00 PDT')).toBeInTheDocument();
      expect(screen.getByText('06:00')).toBeInTheDocument();

      // Advance past 08:00Z (30 min + buffer) → the 06Z run takes over.
      await vi.advanceTimersByTimeAsync(30 * 60_000 + 5_000);

      await waitFor(() => {
        expect(screen.getByText('Updated: 2026-08-05 23:00 PDT')).toBeInTheDocument();
      });
      expect(screen.getByText('07:00')).toBeInTheDocument(); // new run's last step (14:00Z)
    } finally {
      vi.useRealTimers();
    }
  });
});
