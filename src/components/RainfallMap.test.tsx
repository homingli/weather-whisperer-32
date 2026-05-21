import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RainfallMap } from './RainfallMap';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock react-leaflet to avoid JSDOM rendering issues
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Rectangle: ({ bounds, pathOptions }: any) => (
    <div 
      data-testid="rectangle" 
      data-bounds={JSON.stringify(bounds)} 
      style={{ backgroundColor: pathOptions.fillColor }} 
    />
  ),
}));

const mockCsvData = `Updated Date and Time (in Hong Kong Time),Ending Date and Time (in Hong Kong Time),Latitude (degree),Longitude (degree),Half-hourly Nowcast Accumulated Rainfall (mm)
202605171600,202605171630,22.3119,114.1728,1.5
202605171600,202605171630,22.3019,114.1742,0.0
202605171600,202605171630,22.2478,114.1736,12.5
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

    // Verify only values > 0 are rendered as Rectangles
    // mockCsvData has 3 lines (excluding header), 2 have value > 0 (1.5 and 12.5)
    const rectangles = screen.getAllByTestId('rectangle');
    expect(rectangles).toHaveLength(2);

    // Verify colors mapped correctly
    // 1.5 mm -> '#4facfe' (Moderate-light)
    // 12.5 mm -> '#f6d365' (Heavy)
    const backgroundColors = rectangles.map(el => el.style.backgroundColor);
    expect(backgroundColors).toContain('rgb(79, 172, 254)'); // rgb equivalent of #4facfe
    expect(backgroundColors).toContain('rgb(246, 211, 101)'); // rgb equivalent of #f6d365
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
