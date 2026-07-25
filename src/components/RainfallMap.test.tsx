import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RainfallMap } from './RainfallMap';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock react-leaflet. The rainfall overlay is a RainfallCellsLayer that
// mounts L.Rectangle instances via the canvas renderer (L.canvas()).
// The actual rendering happens inside Leaflet's renderer; the stub map
// here exposes the minimal API surface that RainfallCellsLayer calls
// into via useMap().

const stubMap = {
  addLayer: () => {},
  removeLayer: () => {},
  getPane: () => document.createElement('div'),
  getContainer: () => document.body,
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
  on: () => {},
  off: () => {},
  add: () => stubMap,
  remove: () => {},
};

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
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

    // Click load button to start fetching
    screen.getByRole('button', { name: /Load Map/i }).click();

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText('Failed to load data')).toBeInTheDocument();
      expect(screen.getByText('Could not load gridded rainfall data.')).toBeInTheDocument();
    });
  });
});
