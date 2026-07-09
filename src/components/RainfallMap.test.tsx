import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RainfallMap } from './RainfallMap';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock react-leaflet to avoid JSDOM rendering issues.
// The component renders color-bucketed GeoJSON FeatureCollections — one layer per
// rainfall color — instead of per-cell rectangles (see P3-001).
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  GeoJSON: ({ style, data }: any) => (
    <div
      data-testid="geojson"
      data-fill-color={style?.fillColor}
      data-stroke-color={style?.color}
      data-feature-count={data?.features?.length}
    />
  ),
  ZoomControl: () => <div data-testid="zoom-control" />,
  Marker: ({ position }: any) => <div data-testid="marker" data-position={JSON.stringify(position)} />,
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
        <LanguageProvider>
          {ui}
        </LanguageProvider>
      </QueryClientProvider>
    );
  };

  it('renders correctly and parses CSV rainfall data', async () => {
    // Mock the global fetch call
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
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

    // The 4 non-zero rainfall cells fall into 3 color buckets:
    //   - #4facfe (0.5–2 mm band): 1.5 + 0.8 mm  → 2 features
    //   - #00f2fe (2–5 mm band):   3.5 mm          → 1 feature
    //   - #f6d365 (10–20 mm band): 12.5 mm         → 1 feature
    // polygonStyle() applies FILL_ALPHA (0.4) to the fill so the renderer can
    // anti-alias the seams; the stroke uses full alpha so we assert against
    // the stroke (full alpha) and assert fill alpha separately.
    const layers = screen.getAllByTestId('geojson');
    expect(layers).toHaveLength(3);

    const fillColors = layers.map(el => el.getAttribute('data-fill-color'));
    const strokeColors = layers.map(el => el.getAttribute('data-stroke-color'));
    expect(strokeColors).toContain('rgba(79, 172, 254, 1)');   // #4facfe
    expect(strokeColors).toContain('rgba(0, 242, 254, 1)');    // #00f2fe
    expect(strokeColors).toContain('rgba(246, 211, 101, 1)'); // #f6d365
    expect(fillColors).toContain('rgba(79, 172, 254, 0.4)');
    expect(fillColors).toContain('rgba(0, 242, 254, 0.4)');
    expect(fillColors).toContain('rgba(246, 211, 101, 0.4)');

    // All features should be present (2 + 1 + 1 = 4 cells).
    const featureCounts = layers.map(el => Number(el.getAttribute('data-feature-count')));
    expect(featureCounts.reduce((sum, n) => sum + n, 0)).toBe(4);
  });

  it('transitions timeline step and swaps the rendered color buckets', async () => {
    // Multi-step CSV so we can verify the active step drives the layer set.
    // Step 1: 1 cell at 1.5mm  (one #4facfe bucket)
    // Step 2: 1 cell at 1.5mm  (one #4facfe bucket)
    // Step 3: 1 cell at 12.5mm (one #f6d365 bucket)
    const multiStepCsv = `Updated Date and Time (in Hong Kong Time),Ending Date and Time (in Hong Kong Time),Latitude (degree),Longitude (degree),Half-hourly Nowcast Accumulated Rainfall (mm)
202605171600,202605171630,22.3119,114.1728,1.5
202605171600,202605171700,22.3119,114.1728,1.5
202605171700,202605171730,22.2478,114.1736,12.5
`;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => multiStepCsv,
    });
    vi.stubGlobal('fetch', mockFetch);

    renderWithLanguage(<RainfallMap />);
    screen.getByRole('button', { name: /Load Map/i }).click();

    // Step 1 (16:30) — only the 1.5 mm cell.
    await waitFor(() => {
      expect(screen.getAllByText('16:30').length).toBeGreaterThan(0);
    });
    let layers = screen.getAllByTestId('geojson');
    expect(layers).toHaveLength(1);
    expect(layers[0].getAttribute('data-stroke-color')).toBe('rgba(79, 172, 254, 1)');

    // Step 3 (17:30) — only the 12.5 mm cell, different bucket.
    const stepButtons = screen.getAllByRole('button', { name: '17:30' });
    fireEvent.click(stepButtons[0]);

    await waitFor(() => {
      layers = screen.getAllByTestId('geojson');
      expect(layers).toHaveLength(1);
      expect(layers[0].getAttribute('data-stroke-color')).toBe('rgba(246, 211, 101, 1)');
    });

    // Step 2 (17:00) — 1.5 mm cell, back to the lighter bucket.
    const stepButton17 = screen.getAllByRole('button', { name: '17:00' });
    fireEvent.click(stepButton17[0]);
    await waitFor(() => {
      layers = screen.getAllByTestId('geojson');
      expect(layers).toHaveLength(1);
      expect(layers[0].getAttribute('data-stroke-color')).toBe('rgba(79, 172, 254, 1)');
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
