import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RainfallMap } from './RainfallMap';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock react-leaflet to avoid JSDOM rendering issues.
// The component renders color-bucketed GeoJSON FeatureCollections — one layer per
// rainfall color — instead of per-cell rectangles (see P3-001).
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  GeoJSON: ({ style, key }: any) => (
    <div
      data-testid="geojson"
      data-fill-color={style?.fillColor}
      data-key={key}
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
    vi.restoreAllMocks();
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
    global.fetch = mockFetch;

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
    //   - #4facfe (Moderate-light): 1.5 + 0.8 mm
    //   - #00f2fe (Moderate):        3.5 mm
    //   - #f6d365 (Heavy):          12.5 mm
    const layers = screen.getAllByTestId('geojson');
    expect(layers).toHaveLength(3);

    const fillColors = layers.map(el => el.getAttribute('data-fill-color'));
    expect(fillColors).toContain('#4facfe');
    expect(fillColors).toContain('#00f2fe');
    expect(fillColors).toContain('#f6d365');
  });

  it('handles fetch errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network Error'));
    global.fetch = mockFetch;

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
