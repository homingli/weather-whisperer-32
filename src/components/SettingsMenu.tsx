import { useState, KeyboardEvent } from 'react';
import { Menu, Sun, Moon, SunMoon, Search, LocateFixed, MapPin, RefreshCw, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage, Language, formatString } from '@/contexts/LanguageContext';
import { useUnits, Units } from '@/contexts/UnitsContext';
import { useFontSize, FontSize } from '@/contexts/FontSizeContext';
import { useCitySearch } from '@/hooks/useCitySearch';
import { isInHongKong } from '@/lib/hko-weather';
import { cn } from '@/lib/utils';
import { GeoLocation, getUserLocation, reverseGeocode, setDefaultCity } from '@/lib/weather';
import { logWarn } from '@/lib/log';
import { toast } from 'sonner';

const languages: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'tc', label: '繁體中文' },
];

interface SettingsMenuProps {
  currentCity: GeoLocation | null;
  recentCities: GeoLocation[];
  onCitySelect: (city: GeoLocation) => void;
  onRefresh?: () => Promise<void>;
}

interface PillOption<T extends string> {
  value: T;
  label: string;
  /** Optional leading icon (e.g. theme Sun/Moon/SunMoon) — hidden from AT. */
  icon?: LucideIcon;
}

/**
 * Segmented pill toggle. Used for Theme, Units and Language — any 2- or
 * 3-way exclusive choice. Implemented as a radio group for a11y (role=
 * radiogroup / role=radio + aria-checked) instead of using DropdownMenuItem,
 * because the states are mutually exclusive and the active option is always
 * visible.
 */
function PillToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: PillOption<T>[];
  onChange: (next: T) => void;
}) {
  // Arrow-key navigation between radio buttons (a11y: standard radiogroup UX).
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx === -1) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = (idx + 1) % options.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = (idx - 1 + options.length) % options.length;
    } else if (e.key === 'Home') {
      next = 0;
    } else if (e.key === 'End') {
      next = options.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    onChange(options[next].value);
  };

  return (
    <div className="px-2 py-1.5">
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className="flex rounded-md border border-border overflow-hidden bg-background"
      >
        {options.map((opt, i) => {
          const active = opt.value === value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(opt.value)}
              className={cn(
                // WCAG 2.5.5 Level AAA: 44×44 CSS pixel tap target. min-h-[2.75rem]
                // (44px) keeps the toggle on a phone hit-zone; the icon-only
                // actions get the same treatment.
                'inline-flex flex-1 min-h-[2.75rem] items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                i > 0 && 'border-l border-border',
                active
                  ? 'bg-foreground text-background'
                  : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60',
              )}
            >
              {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsMenu({ currentCity, recentCities, onCitySelect, onRefresh }: SettingsMenuProps) {
  const { mode, setMode } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { units, setUnits } = useUnits();
  const { fontSize, setFontSize } = useFontSize();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data: results, isFetching, isPlaceholderData } = useCitySearch(query);
  const [isLocating, setIsLocating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshData = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    toast.info(t('data.refreshing'));
    try {
      await onRefresh();
      toast.success(t('data.refreshed'));
    } catch {
      toast.error(t('data.refreshFailed'));
    } finally {
      setIsRefreshing(false);
    }
  };

  // Short labels — full names (淺色模式 / 深色模式) overflow the pill cells,
  // and the leading icon makes each option scannable regardless.
  const themeLabels = {
    light: language === 'tc' ? '淺色' : 'Light',
    dark: language === 'tc' ? '深色' : 'Dark',
    auto: language === 'tc' ? '自動' : 'Auto',
  };

  const handleRefreshLocation = async () => {
    setIsLocating(true);
    try {
      const coords = await getUserLocation();
      const location = await reverseGeocode(coords.latitude, coords.longitude);
      if (location) {
        setDefaultCity(location);
        onCitySelect(location);
        toast.success(formatString(t('search.locationUpdated'), location.name));
      }
    } catch (error) {
      // Browser geolocation API failures (permission denied, timeout,
      // unavailable) don't go through the fetch layer, so log here.
      logWarn('[settings] getUserLocation failed', error);
      toast.error(t('search.locationError'));
    } finally {
      setIsLocating(false);
    }
  };

  const handleSelectCity = (city: GeoLocation) => {
    setDefaultCity(city);
    onCitySelect(city);
    setSearchOpen(false);
    setQuery('');
  };

  const filteredRecent = recentCities.filter(
    c => !(currentCity && c.latitude === currentCity.latitude && c.longitude === currentCity.longitude)
  ).slice(0, 3);

  // Used by both the spinner show-if and the empty-state show-if below;
  // one string trim per render instead of two.
  const trimmedLen = query.trim().length;

  // Pill options for units — short labels (the menu had verbose "(°C, km/h, mm)"
  // suffixes that don't fit in a pill; the active unit is unambiguous from
  // the rest of the UI).
  const unitOptions: { value: Units; label: string }[] = [
    { value: 'metric', label: 'Metric' },
    { value: 'us', label: 'US' },
  ];

  // Pill options for text size — scales the whole rem-based layout, so a
  // low-resolution phone can trade density for fit (Small) and anyone can
  // trade fit for readability (Large).
  const fontSizeOptions: { value: FontSize; label: string }[] = [
    { value: 'small', label: t('settings.fontSize.small') },
    { value: 'medium', label: t('settings.fontSize.medium') },
    { value: 'large', label: t('settings.fontSize.large') },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-full min-h-[2.75rem] sm:min-h-[3.5rem] w-12 sm:w-14 text-muted-foreground hover:text-foreground">
            <Menu className="h-6 w-6 sm:h-7 sm:w-7" />
            <span className="sr-only">{t('settings.label')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[280px] text-lg p-2">
          {/* Primary actions — Current location / Search / Refresh data as
              one segmented icon pill (same border styling as the Theme/
              Units/Language pills below). */}
          <div className="mx-2 mb-1 flex overflow-hidden rounded-md border border-border bg-background">
            <DropdownMenuItem
              onClick={handleRefreshLocation}
              disabled={isLocating}
              aria-label={t('search.useLocation')}
              title={t('search.useLocation')}
              className="flex-1 min-h-[2.75rem] justify-center rounded-none px-0 text-muted-foreground focus:bg-muted/60 focus:text-foreground data-[highlighted]:bg-muted/60 data-[highlighted]:text-foreground"
            >
              <LocateFixed aria-hidden="true" className={`h-5 w-5 ${isLocating ? 'animate-spin' : ''}`} />
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setSearchOpen(true)}
              aria-label={t('search.city')}
              title={t('search.city')}
              className="flex-1 min-h-[2.75rem] justify-center rounded-none border-l border-border px-0 text-muted-foreground focus:bg-muted/60 focus:text-foreground data-[highlighted]:bg-muted/60 data-[highlighted]:text-foreground"
            >
              <Search aria-hidden="true" className="h-5 w-5" />
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleRefreshData}
              disabled={isRefreshing}
              aria-label={t('data.refresh')}
              title={t('data.refresh')}
              className="flex-1 min-h-[2.75rem] justify-center rounded-none border-l border-border px-0 text-muted-foreground focus:bg-muted/60 focus:text-foreground data-[highlighted]:bg-muted/60 data-[highlighted]:text-foreground"
            >
              <RefreshCw aria-hidden="true" className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </DropdownMenuItem>
          </div>
          {filteredRecent.map((city) => (
            <DropdownMenuItem key={`${city.latitude}-${city.longitude}`} onClick={() => handleSelectCity(city)} className="gap-2.5 py-3">
              <MapPin className="h-5 w-5" />
              {city.name}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          {/* Units pill toggle */}
          <PillToggle
            label={t('settings.units')}
            value={units}
            options={unitOptions}
            onChange={setUnits}
          />

          <DropdownMenuSeparator />

          {/* Theme — same segmented pill as Units/Language. Icons keep the
              3-way Auto/Light/Dark choice scannable with short labels. */}
          <PillToggle
            label={language === 'tc' ? '主題' : 'Theme'}
            value={mode}
            options={[
              { value: 'auto', label: themeLabels.auto, icon: SunMoon },
              { value: 'light', label: themeLabels.light, icon: Sun },
              { value: 'dark', label: themeLabels.dark, icon: Moon },
            ]}
            onChange={setMode}
          />

          <DropdownMenuSeparator />

          {/* Language pill toggle */}
          <PillToggle
            label={language === 'tc' ? '語言' : 'Language'}
            value={language}
            options={languages}
            onChange={setLanguage}
          />

          <DropdownMenuSeparator />

          {/* Text size pill — rescales the root font-size so the entire
              rem-based layout grows/shrinks with it. */}
          <PillToggle
            label={t('settings.fontSize')}
            value={fontSize}
            options={fontSizeOptions}
            onChange={setFontSize}
          />

          <DropdownMenuSeparator />

          {/* Data-source credit — lives at the bottom of the menu instead of
              a page footer so the forecast cards can use the full viewport
              height. Mirrors the credit the page footer used to show: both
              sources when the selected city is in HK coverage, Open-Meteo
              alone otherwise (no city yet included). */}
          <div className="px-3 py-2 text-center text-[0.6875rem] leading-relaxed text-muted-foreground/70">
            {currentCity && isInHongKong(currentCity.latitude, currentCity.longitude)
              ? formatString(t('source.poweredByBoth'), t('source.openMeteo'), t('source.hko'))
              : formatString(t('source.poweredBy'), t('source.openMeteo'))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
          <DialogTitle className="sr-only">{t('search.city')}</DialogTitle>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <Input
              type="text"
              placeholder={t('search.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('search.placeholder')}
              className="border-0 bg-transparent p-0 h-auto text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {/* Only show the spinner on a true first-load (isFetching && no
                prior data). When keepPreviousData is supplying placeholder
                results during a query-key change, the prior results stay
                visible — no spinner blink. */}
            {isFetching && !isPlaceholderData && trimmedLen >= 2 ? (
                <div className="p-4 text-center text-muted-foreground">{t('search.searching')}</div>
              ) : results.length > 0 ? (
              <ul className="divide-y divide-border/30">
                {results.map((city, index) => (
                  <li key={`${city.name}-${city.latitude}-${city.longitude}-${index}`}>
                    <button
                      onClick={() => handleSelectCity(city)}
                      className="w-full px-4 py-3 text-left hover:bg-secondary/50 transition-colors flex items-center gap-3"
                    >
                      <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
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
                <div className="p-4 text-center text-muted-foreground">{t('search.noResults')}</div>
              ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}