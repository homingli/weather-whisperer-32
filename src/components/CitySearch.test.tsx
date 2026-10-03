import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel, type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ThemeProvider } from '@/contexts/ThemeProvider';
import { LanguageProvider } from '@/contexts/LanguageProvider';
import { CitySearch } from './CitySearch';
import { GeoLocation, getUserLocation, reverseGeocode, searchCities } from '@/lib/weather';

// CitySearch reaches into the weather barrel for both search
// (via useCitySearch) and browser geolocation. Mock the network-touching
// three; storage helpers stay real (localStorage-backed, safe in jsdom).
vi.mock('@/lib/weather', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/weather')>()),
  searchCities: vi.fn(),
  getUserLocation: vi.fn(),
  reverseGeocode: vi.fn(),
}));

const london: GeoLocation = { name: 'London', latitude: 51.5072, longitude: -0.1276, country: 'GB', admin1: 'England' };
const hongKong: GeoLocation = { name: 'Hong Kong', latitude: 22.3193, longitude: 114.1694, country: 'HK' };

// Fresh QueryClient per test — same rationale as SettingsMenu.test: the
// geocode cache must not leak between tests.
function TestProviders({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <LanguageProvider>{children}</LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('CitySearch (landing empty-state search, HML-58)', () => {
  let user: UserEvent;
  const onCitySelect = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
  });

  const renderSearch = (recentCities: GeoLocation[] = []) =>
    render(
      <TestProviders>
        <CitySearch recentCities={recentCities} onCitySelect={onCitySelect} />
      </TestProviders>,
    );

  it('shows matching cities for a query and selects one on click', async () => {
    vi.mocked(searchCities).mockResolvedValue([london]);
    renderSearch();

    const input = screen.getByRole('textbox', { name: /search for a city/i });
    await user.type(input, 'lond');

    const resultButton = await screen.findByRole('button', { name: /London England, GB/i });
    await user.click(resultButton);

    expect(onCitySelect).toHaveBeenCalledWith(london);
    // Selecting clears the query, so the results list closes.
    expect(input).toHaveValue('');
    expect(screen.queryByRole('button', { name: /London England, GB/i })).not.toBeInTheDocument();
  });

  it('does not query the geocoding API below the 2-character gate', async () => {
    vi.mocked(searchCities).mockResolvedValue([]);
    renderSearch();

    await user.type(screen.getByRole('textbox', { name: /search for a city/i }), 'x');
    expect(searchCities).not.toHaveBeenCalled();
  });

  it('shows a no-results message when the search finds nothing', async () => {
    vi.mocked(searchCities).mockResolvedValue([]);
    renderSearch();

    await user.type(screen.getByRole('textbox', { name: /search for a city/i }), 'xyzzy');
    expect(await screen.findByText('No cities found')).toBeInTheDocument();
    expect(onCitySelect).not.toHaveBeenCalled();
  });

  it('selects the reverse-geocoded city via "Use current location"', async () => {
    vi.mocked(getUserLocation).mockResolvedValue({ latitude: 22.3193, longitude: 114.1694 });
    vi.mocked(reverseGeocode).mockResolvedValue(hongKong);
    renderSearch();

    await user.click(screen.getByRole('button', { name: /use current location/i }));

    await waitFor(() => expect(onCitySelect).toHaveBeenCalledWith(hongKong));
  });

  it('shows an error and recovers when reverse geocoding finds nothing', async () => {
    vi.mocked(getUserLocation).mockResolvedValue({ latitude: 0, longitude: 0 });
    vi.mocked(reverseGeocode).mockResolvedValue(null);
    const errorSpy = vi.spyOn(toast, 'error');
    renderSearch();

    const locateButton = screen.getByRole('button', { name: /use current location/i });
    await user.click(locateButton);

    await waitFor(() => expect(locateButton).not.toBeDisabled());
    expect(onCitySelect).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('keeps the panel usable when geolocation fails', async () => {
    vi.mocked(getUserLocation).mockRejectedValue(new Error('denied'));
    renderSearch();

    const locateButton = screen.getByRole('button', { name: /use current location/i });
    await user.click(locateButton);

    await waitFor(() => expect(locateButton).not.toBeDisabled());
    expect(onCitySelect).not.toHaveBeenCalled();
  });

  it('offers recent cities as shortcuts and selects one on click', async () => {
    renderSearch([london, hongKong]);

    expect(screen.getByText('Recent')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hong Kong' }));

    expect(onCitySelect).toHaveBeenCalledWith(hongKong);
  });
});
