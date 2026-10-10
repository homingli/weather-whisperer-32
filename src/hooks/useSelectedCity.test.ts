import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSelectedCity } from './useSelectedCity';
import type { GeoLocation } from '@/lib/weather';
import {
  getDefaultCity,
  getRecentCities,
  getUserLocation,
  reverseGeocode,
  setDefaultCity,
} from '@/lib/weather';
import { clearLastKnownWeather } from '@/lib/weather/storage';

vi.mock('@/lib/weather', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/weather')>();
  return {
    ...actual,
    getDefaultCity: vi.fn(),
    setDefaultCity: vi.fn(),
    getRecentCities: vi.fn(() => [] as GeoLocation[]),
    getUserLocation: vi.fn(),
    reverseGeocode: vi.fn(),
  };
});

vi.mock('@/lib/weather/storage', () => ({
  clearLastKnownWeather: vi.fn(),
}));

const kowloon: GeoLocation = {
  name: 'Kowloon',
  latitude: 22.319,
  longitude: 114.169,
  country: 'Hong Kong',
};

function setUrl(search: string) {
  window.history.replaceState(null, '', `/${search}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  setUrl('');
});

describe('useSelectedCity — deep link', () => {
  it('hydrates the shared city without prompting for geolocation or persisting', async () => {
    setUrl('?lat=22.319&lon=114.169&name=Kowloon');
    vi.mocked(reverseGeocode).mockResolvedValue(kowloon);

    const { result } = renderHook(() => useSelectedCity());

    await waitFor(() => {
      expect(result.current.selectedCity).toEqual({
        name: 'Kowloon',
        latitude: 22.319,
        longitude: 114.169,
        country: '',
      });
    });
    expect(getUserLocation).not.toHaveBeenCalled();
    expect(getDefaultCity).not.toHaveBeenCalled();
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(setDefaultCity).not.toHaveBeenCalled();
    expect(clearLastKnownWeather).not.toHaveBeenCalled();
    expect(result.current.isLocating).toBe(false);
  });

  it('enriches a nameless link with a reverse geocode, coords untouched', async () => {
    setUrl('?lat=49.2827&lon=-123.1207');
    vi.mocked(reverseGeocode).mockResolvedValue({
      name: 'Vancouver',
      latitude: 49.2827,
      longitude: -123.1207,
      country: 'Canada',
      admin1: 'British Columbia',
    });

    const { result } = renderHook(() => useSelectedCity());

    await waitFor(() => {
      expect(result.current.selectedCity?.name).toBe('Vancouver');
    });
    expect(result.current.selectedCity?.latitude).toBe(49.2827);
    expect(getUserLocation).not.toHaveBeenCalled();
    expect(setDefaultCity).not.toHaveBeenCalled();
  });

  it('keeps the empty name when the reverse geocode only yields the placeholder', async () => {
    setUrl('?lat=49.2827&lon=-123.1207');
    vi.mocked(reverseGeocode).mockResolvedValue({
      name: 'Current Location',
      latitude: 49.2827,
      longitude: -123.1207,
      country: '',
    });

    const { result } = renderHook(() => useSelectedCity());

    await waitFor(() => {
      expect(reverseGeocode).toHaveBeenCalled();
    });
    expect(result.current.selectedCity?.name).toBe('');
  });

  it('an explicit city pick persists AND strips the deep-link params', async () => {
    setUrl('?lat=22.319&lon=114.169&name=Kowloon');
    vi.mocked(reverseGeocode).mockResolvedValue(kowloon);

    const { result } = renderHook(() => useSelectedCity());
    await waitFor(() => {
      expect(result.current.selectedCity).not.toBeNull();
    });

    act(() => {
      result.current.handleCitySelect({
        name: 'Vancouver',
        latitude: 49.2827,
        longitude: -123.1207,
        country: 'Canada',
      });
    });

    expect(result.current.selectedCity?.name).toBe('Vancouver');
    expect(setDefaultCity).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Vancouver' })
    );
    expect(window.location.search).toBe('');
  });

  it('falls through to the normal flow for malformed link params', async () => {
    setUrl('?lat=91&lon=114.169&name=Kowloon');
    vi.mocked(getDefaultCity).mockReturnValue(null);
    vi.mocked(getUserLocation).mockResolvedValue({ latitude: 22.3, longitude: 114.2 });
    vi.mocked(reverseGeocode).mockResolvedValue(kowloon);

    const { result } = renderHook(() => useSelectedCity());

    await waitFor(() => {
      expect(result.current.selectedCity?.name).toBe('Kowloon');
    });
    expect(getUserLocation).toHaveBeenCalled();
    expect(setDefaultCity).toHaveBeenCalled();
  });
});

describe('useSelectedCity — normal start (no deep link)', () => {
  it('loads the saved default city and geolocates in the background', async () => {
    vi.mocked(getDefaultCity).mockReturnValue(kowloon);
    vi.mocked(getUserLocation).mockResolvedValue({ latitude: 22.319, longitude: 114.169 });
    vi.mocked(reverseGeocode).mockResolvedValue(kowloon);

    const { result } = renderHook(() => useSelectedCity());

    await waitFor(() => {
      expect(result.current.isLocating).toBe(false);
    });
    expect(result.current.selectedCity?.name).toBe('Kowloon');
    // Same coords (±0.01°) as the default — no re-persist.
    expect(setDefaultCity).not.toHaveBeenCalled();
    expect(getRecentCities).toHaveBeenCalled();
  });

  it('persists when geolocation lands far from the saved default', async () => {
    vi.mocked(getDefaultCity).mockReturnValue(kowloon);
    vi.mocked(getUserLocation).mockResolvedValue({ latitude: 49.28, longitude: -123.12 });
    vi.mocked(reverseGeocode).mockResolvedValue({
      name: 'Vancouver',
      latitude: 49.28,
      longitude: -123.12,
      country: 'Canada',
    });

    const { result } = renderHook(() => useSelectedCity());

    await waitFor(() => {
      expect(result.current.selectedCity?.name).toBe('Vancouver');
    });
    expect(setDefaultCity).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Vancouver' })
    );
  });
});
