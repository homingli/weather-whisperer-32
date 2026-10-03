import { useState } from 'react';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useCitySearch } from '@/hooks/useCitySearch';
import { useLocateCity } from '@/hooks/useLocateCity';
import { useLanguage } from '@/contexts/LanguageContext';
import { GeoLocation } from '@/lib/weather';
import { cn } from '@/lib/utils';

interface CitySearchProps {
  /** Saved recent cities offered as one-tap shortcuts before any query. */
  recentCities?: GeoLocation[];
  onCitySelect: (city: GeoLocation) => void;
  className?: string;
}

/**
 * Inline city-search panel for the landing page's empty state (HML-58): a
 * user who denied or dismissed the geolocation prompt lands on a welcome
 * card that told them to search without offering one. This panel is the
 * fix — same useCitySearch hook and result rows as the SettingsMenu search
 * dialog, but always visible, plus "use current location" and recent-city
 * shortcuts for the no-query state.
 */
export function CitySearch({ recentCities = [], onCitySelect, className }: CitySearchProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const { isLocating, locate } = useLocateCity(onCitySelect);
  const { data: results, isFetching, isPlaceholderData } = useCitySearch(query);

  // Used by both the spinner show-if and the empty-state show-if below;
  // one string trim per render instead of two (same pattern as SettingsMenu).
  const trimmedLen = query.trim().length;

  // Index passes handleCitySelect, which persists the default city — no
  // separate setDefaultCity call here.
  const handleSelectCity = (city: GeoLocation) => {
    onCitySelect(city);
    setQuery('');
  };

  // Recents are unreachable in the live app today — useSelectedCity always
  // sets recentCities together with a selected city, so the empty state only
  // ever sees an empty list. Kept per HML-58 spec so the panel works
  // unchanged once a "clear saved location" path exists.
  const recents = recentCities.slice(0, 3);

  return (
    <div className={cn('w-full max-w-md mx-auto text-left', className)}>
      <div className="flex items-center gap-3 glass-card rounded-xl px-4 py-3">
        <Search className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
        <Input
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('search.placeholder')}
          className="border-0 bg-transparent p-0 h-auto text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Only show the spinner on a true first-load (isFetching && no prior
          data); keepPreviousData keeps prior results visible between keys. */}
      {isFetching && !isPlaceholderData && trimmedLen >= 2 ? (
        <div className="py-4 text-center text-muted-foreground" role="status">{t('search.searching')}</div>
      ) : results.length > 0 ? (
        <ul className="glass-card rounded-xl mt-2 divide-y divide-border/30 overflow-hidden">
          {results.map((city, index) => (
            <li key={`${city.name}-${city.latitude}-${city.longitude}-${index}`}>
              <button
                onClick={() => handleSelectCity(city)}
                className="w-full px-4 py-3 text-left hover:bg-secondary/50 transition-colors flex items-center gap-3"
              >
                <MapPin className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">{city.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {city.admin1 ? `${city.admin1}, ` : ''}{city.country}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : trimmedLen >= 2 ? (
        <div className="py-4 text-center text-muted-foreground" role="status">{t('search.noResults')}</div>
      ) : null}

      {/* Shortcuts only make sense before a query narrows the results. */}
      {trimmedLen < 2 && (
        <div className="mt-5 flex flex-col items-center gap-4">
          {recents.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground">{t('search.recent')}</span>
              {recents.map((city) => (
                <button
                  key={`${city.latitude}-${city.longitude}`}
                  onClick={() => handleSelectCity(city)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-sm hover:bg-secondary/50 transition-colors"
                >
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                  {city.name}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => locate()}
            disabled={isLocating}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            <LocateFixed className={cn('h-4 w-4', isLocating && 'animate-spin')} aria-hidden="true" />
            {t('search.useLocation')}
          </button>
        </div>
      )}
    </div>
  );
}
