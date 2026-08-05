import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RainfallMap } from './RainfallMap';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { writeNowcastCache, clearNowcastCache } from '@/lib/nowcastCache';

// Mock react-leaflet. The rainfall overlay is a RainfallCellsLayer that
// mounts L.Rectangle instances via the canvas renderer (L.canvas()).
// The actual rendering happens inside Leaflet's renderer; the stub map
// here exposes the minimal API surface that RainfallCellsLayer calls
// into via useMap().

const stubMap: Record<string, unknown> = {
  addLayer: () => {},
  removeLayer: () => {},
  getPane: () => document.createElement('div'),
  // Dedicated container element (not document.body) so the blank-on-mobile
  // ResizeObserver attaches to a real, distinct node — if a future test
  // upgrades the global ResizeObserver mock to actually fire callbacks,
  // it'll observe the correct element instead of polluting body-level
  // resize events across every test.
  getContainer: () => document.createElement('div'),
  getPanes: () => ({ overlayPane: document.createElement('div') }),
  getSize: () => ({ x: 600, y: 600 }),
  getBounds: () => ({
    getSouth: () => 21.5,
    getNorth: () => 23.0,
    getWest: () => 113.0,
    getEast: () => 114.5,
  }),
  containerPointToLayerPoint: () => ({ x: 0, y: 0 }),
  latLngToLayerPoint: () => ({ x: 0, y: 0 }),
  // The blank-on-mobile fix calls invalidateSize() on the next frame after
  // the ref lands and again whenever a ResizeObserver fires. Previous tests
  // didn't need this because the inner only read the map's size, but the
  // ref-callback now actively re-layouts the map. Stub it as a no-op so
  // the call doesn't throw.
  invalidateSize: () => {},
  on: () => {},
  off: () => {},
  add: () => stubMap,
  remove: () => {},
  // Viewport-init effect calls these once the ref finally lands.
  fitBounds: () => {},
  setView: () => {},
};
// Interaction-handler stubs. Each is an object with an `enabled` flag and
// enable()/disable() mutators. Tests assert on `enabled` to verify the
// lock/unlock behavior fires after the map ref lands.
const makeHandler = () => {
  const h = { enabled: false, enable() { h.enabled = true; }, disable() { h.enabled = false; } };
  return h;
};
['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom', 'keyboard'].forEach((k) => {
  stubMap[k] = makeHandler();
});

// forwardRef mirrors the real react-leaflet ref forwarding: useImperativeHandle
// (not a manual ref call inside render) so React's ref lifecycle fires both
// directions — ref(stubMap) on mount AND ref(null) on unmount. The latter is
// what the blank-on-mobile fix's else-branch relies on to disconnect the
// ResizeObserver; without useImperativeHandle the test would never observe
// the unmount ref-null call.
const MapContainerStub = forwardRef<unknown, { children?: React.ReactNode }>(
  function MapContainerStub(props, ref) {
    useImperativeHandle(ref, () => stubMap, []);
    return <div data-testid="map-container">{props.children}</div>;
  }
);

vi.mock('react-leaflet', () => ({
  MapContainer: MapContainerStub,
  TileLayer: () => <div data-testid="tile-layer" />,
  ZoomControl: () => <div data-testid="zoom-control" />,
  Marker: ({ position }: { position: [number, number] }) => <div data-testid="marker" data-position={JSON.stringify(position)} />,
  useMap: () => stubMap,
}));

vi.mock('./RainfallCellsLayer', () => ({
  RainfallCellsLayer: ({ grid, activeStep }: { grid: { rows: number; cols: number; stepCount: number }; activeStep: number }) => {
    // The real component mounts L.Rectangle instances imperatively; the
    // mock is a no-op render that exposes the grid shape for assertions.
    return (
      <div
        data-testid="rainfall-cells-layer"
        data-rows={grid.rows}
        data-cols={grid.cols}
        data-step-count={grid.stepCount}
        data-active-step={activeStep}
      />
    );
  },
}));

const mockCsvData = `Updated Date and Time (in Hong Kong Time),Ending Date and Time (in Hong Kong Time),Latitude (degree),Longitude (degree),Half-hourly Nowcast Accumulated Rainfall (mm)
202605171600,202605171630,22.3119,114.1728,1.5
202605171600,202605171630,22.3019,114.1742,0.0
202605171600,202605171630,22.2478,114.1736,12.5
202605171600,202605171630,23.1290,113.2640,3.5
202605171600,202605171630,23.4870,112.9560,0.8
`;

describe('RainfallMap Component', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // Clear the localStorage nowcast cache between tests so a previous test's
    // "Load Map" → fetch → cache write doesn't cause the next test to skip
    // the load button and go straight to the map.
    clearNowcastCache();
  });

  const renderWithLanguage = (ui: React.ReactElement) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LanguageProvider>
            {ui}
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };

  it('renders correctly and parses CSV into a Float32Array grid', async () => {
    // Mock the global fetch call
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => mockCsvData,
    });
    vi.stubGlobal('fetch', mockFetch);

    renderWithLanguage(<RainfallMap />);

    // Click load button to start fetching
    screen.getByRole('button', { name: /Load Map/i }).click();

    // Check header/title renders
    expect(screen.getByText('Rain Cloud Nowcast')).toBeInTheDocument();

    // Wait for the data to load and render
    await waitFor(() => {
      expect(screen.getByText('Updated: 2026-05-17 16:00')).toBeInTheDocument();
    });

    // Check MapContainer renders
    expect(screen.getByTestId('map-container')).toBeInTheDocument();

    // The rain grid is the new data model. The CSV has 4 non-zero cells
    // across 3 distinct color bands (1.5 mm + 0.8 mm = #4facfe, 3.5 mm =
    // #00f2fe, 12.5 mm = #f6d365). The grid is built from the OBSERVED
    // lat/lon values — the 4 non-zero cells have 4 unique lats and 4 unique
    // lons, so the grid is exactly 4×4. No fixed dLat/dLat constants; the
    // observed spacing is reported via data-cell-dlat / -dlon.
    const grid = screen.getByTestId('rain-grid');
    expect(grid).toBeInTheDocument();
    expect(grid.getAttribute('data-step-count')).toBe('1');
    expect(Number(grid.getAttribute('data-rows'))).toBe(4);
    expect(Number(grid.getAttribute('data-cols'))).toBe(4);

    // dLat/dLon are derived from adjacent observed cells (not assumed).
    expect(Number(grid.getAttribute('data-cell-dlat'))).toBeGreaterThan(0);
    expect(Number(grid.getAttribute('data-cell-dlon'))).toBeGreaterThan(0);

    // The cells layer is mounted with the grid.
    const cellsLayer = screen.getByTestId('rainfall-cells-layer');
    expect(cellsLayer).toBeInTheDocument();
    expect(cellsLayer.getAttribute('data-step-count')).toBe('1');
    expect(cellsLayer.getAttribute('data-active-step')).toBe('0');
  });

  it('transitions timeline step and updates the active step in the layer', async () => {
    // Multi-step CSV so we can verify the active step drives the layer.
    // Step 1: 1 cell at 1.5mm
    // Step 2: 1 cell at 1.5mm
    // Step 3: 1 cell at 12.5mm
    const multiStepCsv = `Updated Date and Time (in Hong Kong Time),Ending Date and Time (in Hong Kong Time),Latitude (degree),Longitude (degree),Half-hourly Nowcast Accumulated Rainfall (mm)
202605171600,202605171630,22.3119,114.1728,1.5
202605171600,202605171700,22.3119,114.1728,1.5
202605171700,202605171730,22.2478,114.1736,12.5
`;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => multiStepCsv,
    });
    vi.stubGlobal('fetch', mockFetch);

    renderWithLanguage(<RainfallMap />);
    screen.getByRole('button', { name: /Load Map/i }).click();

    // Step 1 (16:30) — only the 1.5 mm cell.
    await waitFor(() => {
      expect(screen.getAllByText('16:30').length).toBeGreaterThan(0);
    });
    let grid = screen.getByTestId('rain-grid');
    expect(grid.getAttribute('data-step-count')).toBe('3');
    expect(grid.getAttribute('data-active-step')).toBe('0');

    // Step 3 (17:30) — different mm value, different color band.
    const stepButtons = screen.getAllByRole('button', { name: '17:30' });
    fireEvent.click(stepButtons[0]);

    await waitFor(() => {
      grid = screen.getByTestId('rain-grid');
      expect(grid.getAttribute('data-active-step')).toBe('2');
    });

    // Step 2 (17:00) — back to the 1.5 mm cell.
    const stepButton17 = screen.getAllByRole('button', { name: '17:00' });
    fireEvent.click(stepButton17[0]);
    await waitFor(() => {
      grid = screen.getByTestId('rain-grid');
      expect(grid.getAttribute('data-active-step')).toBe('1');
    });
  });

  it('handles fetch errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network Error'));
    vi.stubGlobal('fetch', mockFetch);

    renderWithLanguage(<RainfallMap />);

    // Click load button to start fetching. findByRole retries the
    // getByRole DOM walk on its own (the walk is expensive in jsdom —
    // ~120ms+ on cold loads) instead of failing synchronously like
    // getByRole does.
    fireEvent.click((await screen.findByRole('button', { name: /Load Map/i }))!);

    // Wait for error state. The component retries once with a 1 s
    // backoff before settling into error — allow up to 10 s to cover
    // the retry + the second failure settling into the query's error
    // state on slow CI. (Was 5 s — bumped because the getByText walks
    // in this branch add ~150ms each on cold jsdom loads and CI's
    // shared runners occasionally spike above 5 s end-to-end.)
    await waitFor(() => {
      expect(screen.getByText('Failed to load data')).toBeInTheDocument();
      expect(screen.getByText('Could not load gridded rainfall data.')).toBeInTheDocument();
    }, { timeout: 10000 });
  });

  it('skips the Load Map prompt and renders directly from cache when fresh', async () => {
    // Pre-seed the localStorage cache with a valid CSV. The outer wrapper
    // should detect the fresh cache on mount, skip the "Load Map" button,
    // and mount RainfallMapInner with the cached CSV as initialData —
    // meaning fetch should never be called.
    writeNowcastCache(mockCsvData, '2026-05-17 16:00', Date.now());

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    renderWithLanguage(<RainfallMap />);

    // The "Load Map" button is never rendered when cache is fresh.
    expect(screen.queryByRole('button', { name: /Load Map/i })).toBeNull();

    // Header still renders.
    expect(screen.getByText('Rain Cloud Nowcast')).toBeInTheDocument();

    // The cached grid is shown immediately (initialData, no loading state).
    await waitFor(() => {
      expect(screen.getByText('Updated: 2026-05-17 16:00')).toBeInTheDocument();
    });
    expect(screen.getByTestId('rain-grid')).toBeInTheDocument();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();

    // Network is not touched because the cache hit is within staleTime.
    // (refetchInterval will fire later, but at this point fetch = 0 calls.)
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows the Load Map prompt again after the cache is cleared', async () => {
    writeNowcastCache(mockCsvData, '2026-05-17 16:00', Date.now());
    clearNowcastCache();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => mockCsvData,
    });
    vi.stubGlobal('fetch', mockFetch);

    renderWithLanguage(<RainfallMap />);

    // Without a cache the prompt renders and fetch waits for the click.
    expect(screen.getByRole('button', { name: /Load Map/i })).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('enables map interactions (drag / zoom / keyboard) when loaded from cache', async () => {
    // Reset the stub handler flags so this test isn't polluted by earlier ones.
    (['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom', 'keyboard'] as const).forEach((k) => {
      (stubMap[k] as { enabled: boolean }).enabled = false;
    });

    writeNowcastCache(mockCsvData, '2026-05-17 16:00', Date.now());
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    renderWithLanguage(<RainfallMap />);

    // The cache-hit path renders directly. Once the map ref lands (i.e.
    // react-leaflet's useImperativeHandle fires), our ref callback must
    // apply the unlock state — even though the lock useEffect only ran
    // once on mount with mapRef.current = null.
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
      expect(screen.getByTestId('rain-grid')).toBeInTheDocument();
    });

    // Each interaction handler is enabled.
    (['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom', 'keyboard'] as const).forEach((k) => {
      expect(stubMap[k]).toHaveProperty('enabled', true);
    });
  });

  it('locks map interactions during initial fetch and unlocks after data arrives', async () => {
    // Reset handler flags.
    (['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom', 'keyboard'] as const).forEach((k) => {
      (stubMap[k] as { enabled: boolean }).enabled = false;
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => mockCsvData,
    });
    vi.stubGlobal('fetch', mockFetch);

    renderWithLanguage(<RainfallMap />);

    // Click Load Map to mount the inner component with no initialData.
    screen.getByRole('button', { name: /Load Map/i }).click();

    // While the fetch is in flight, the map ref callback fires with
    // data=undefined and isLoading=true → handlers disabled.
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
    (['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom', 'keyboard'] as const).forEach((k) => {
      expect(stubMap[k]).toHaveProperty('enabled', false);
    });

    // After the fetch resolves, the lock useEffect re-runs and enables them.
    await waitFor(() => {
      expect(screen.getByTestId('rain-grid')).toBeInTheDocument();
    });
    (['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom', 'keyboard'] as const).forEach((k) => {
      expect(stubMap[k]).toHaveProperty('enabled', true);
    });
  });

  it('calls invalidateSize on the next frame after the map ref lands', async () => {
    // Regression test for the "blank map on mobile" bug: Leaflet reads the
    // container's bounding rect synchronously in its constructor, so a map
    // mounted against a 0x0 container (common during a Swiper slide
    // transition or an iOS Safari URL-bar hide/show) ends up with a 0x0
    // viewport that never recovers on its own. The fix schedules
    // map.invalidateSize() via requestAnimationFrame from the ref callback.
    const invalidateSizeSpy = vi.fn();
    (stubMap as { invalidateSize: () => void }).invalidateSize = invalidateSizeSpy;

    // Cold-start path (no localStorage cache) so the inner mounts via the
    // user's click on the Load Map button.
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => mockCsvData,
    });
    vi.stubGlobal('fetch', mockFetch);

    renderWithLanguage(<RainfallMap />);
    screen.getByRole('button', { name: /Load Map/i }).click();

    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });

    // Run the deferred RAF callback that the ref callback scheduled.
    await waitFor(() => {
      expect(invalidateSizeSpy).toHaveBeenCalled();
    });
  });

  it('disconnects the ResizeObserver when the inner unmounts', async () => {
    // Regression test: the ResizeObserver is attached to the map's
    // container DOM node in handleMapRef. When the inner unmounts,
    // React fires handleMapRef(null); without an else-branch that
    // disconnects, the observer keeps a reference to the now-detached
    // node and leaks across every remount.
    //
    // The global ResizeObserver is a no-op mock (src/test/setup.ts).
    // We spy on its prototype's disconnect() so every observer the inner
    // creates (and any disconnect call against it) is visible to the spy.
    const disconnectSpy = vi.spyOn(window.ResizeObserver.prototype, 'disconnect');

    try {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        text: async () => mockCsvData,
      });
      vi.stubGlobal('fetch', mockFetch);

      const { unmount } = renderWithLanguage(<RainfallMap />);
      screen.getByRole('button', { name: /Load Map/i }).click();

      await waitFor(() => {
        expect(screen.getByTestId('map-container')).toBeInTheDocument();
      });

      // handleMapRef(null) runs synchronously during unmount commit.
      unmount();
      expect(disconnectSpy).toHaveBeenCalled();
    } finally {
      disconnectSpy.mockRestore();
    }
  });

  it('shows a stale-data pill instead of a blocking overlay when a background refetch fails', async () => {
    // First fetch: succeeds and renders the grid. Second fetch (triggered
    // by a manual refetch to avoid waiting for the 15-min refetchInterval):
    // fails. The grid from the first fetch is still on screen, so the UI
    // must show a small "Using last known nowcast" pill — NOT the
    // full-screen error overlay that would trap the map underneath.
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => null },
        text: async () => mockCsvData,
      })
      // Second+ calls (initial + retry) reject. mockRejectedValue is a
      // permanent fallback so it covers every subsequent call without us
      // having to enumerate them.
      .mockRejectedValue(new Error('Network Error'));

    vi.stubGlobal('fetch', mockFetch);

    renderWithLanguage(<RainfallMap />);
    screen.getByRole('button', { name: /Load Map/i }).click();

    // Wait for the first fetch to settle — the grid is on screen AND the
    // map handlers are enabled by the initial-fetch lock unlock.
    await waitFor(() => {
      expect(screen.getByTestId('rain-grid')).toBeInTheDocument();
    });

    // The refresh-nowcast button lives in the top-right control cluster
    // inside the map area. Match the exact aria-label so locale shifts
    // don't silently change the string the test is looking for.
    const refreshBtn = screen.getByRole('button', { name: 'Refresh gridded nowcast' });
    fireEvent.click(refreshBtn);

    // React Query retries once (retry: 1, retryDelay: 1000), so allow up
    // to 10 s for the second failure to settle into the query's error
    // state and the stale pill to render. (Was 5 s — bumped because
    // the getByText DOM walk is ~150ms on cold jsdom loads, and CI's
    // shared runners occasionally spike above 5 s end-to-end for this
    // multi-step path: load map → first fetch → rain-grid → click
    // refresh → retry → stale pill.)
    await waitFor(
      () => {
        expect(screen.getByText('Using last known nowcast')).toBeInTheDocument();
      },
      { timeout: 10000 },
    );

    // The full-screen overlay (with its 3 lines: icon + "Failed to load
    // data" + "Could not load gridded rainfall data.") MUST NOT appear —
    // that would block the map. The stale pill uses different copy, so
    // neither overlay line should match.
    expect(screen.queryByText('Failed to load data')).not.toBeInTheDocument();
    expect(screen.queryByText('Could not load gridded rainfall data.')).not.toBeInTheDocument();
  });

  it('shows the slow-network chip after the initial fetch lingers past 10s', async () => {
    // Use fake timers so the test isn't actually slow. The chip flips on
    // at 10 s of isLoading, so we need to advance the 10 s setTimeout.
    vi.useFakeTimers({ shouldAdvanceTime: false });

    // Fetch that hangs until we say so.
    let resolveFetch: (v: unknown) => void = () => {};
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', mockFetch);

    try {
      renderWithLanguage(<RainfallMap />);
      screen.getByRole('button', { name: /Load Map/i }).click();

      // Confirm the chip is NOT visible during the first 10 s.
      expect(screen.queryByText(/Slow connection/)).not.toBeInTheDocument();

      // Advance past the 10 s threshold. The only 10 s timer in the
      // component path is the slow-network chip effect; the fetch
      // timeout is 30 s and the React Query retry is 1 s — neither
      // overlaps with 10 s, so this advance is safe.
      await vi.advanceTimersByTimeAsync(10_500);

      expect(screen.getByText(/Slow connection/)).toBeInTheDocument();
    } finally {
      // Resolve the hanging fetch and restore real timers so the test
      // suite doesn't leak.
      resolveFetch({
        ok: true,
        headers: { get: () => null },
        text: async () => mockCsvData,
      });
      vi.useRealTimers();
    }
  });
});
