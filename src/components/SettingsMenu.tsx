import { useState, KeyboardEvent } from 'react';
import { Menu, Sun, Moon, SunMoon, Search, LocateFixed, MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage, Language, formatString } from '@/contexts/LanguageContext';
import { useUnits, Units } from '@/contexts/UnitsContext';
import { cn } from '@/lib/utils';
import { searchCities, GeoLocation, getUserLocation, reverseGeocode, setDefaultCity } from '@/lib/weather';
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

/**
 * Segmented pill toggle. Used for both Units and Language — any 2- or 3-way
 * exclusive choice. Implemented as a radio group for a11y (role=radiogroup /
 * role=radio + aria-checked) instead of using DropdownMenuItem, because the
 * two states are mutually exclusive and the active option is always visible.
 */
function PillToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
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
    <div className="flex flex-col gap-2 px-2 py-2">
      <span className="text-sm text-muted-foreground font-normal">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className="flex rounded-md border border-border overflow-hidden bg-background"
      >
        {options.map((opt, i) => {
          const active = opt.value === value;
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
                // icons above get the same treatment.
                'flex-1 min-h-[2.75rem] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                i > 0 && 'border-l border-border',
                active
                  ? 'bg-foreground text-background'
                  : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60',
              )}
            >
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
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

  const themeLabels = {
    light: language === 'tc' ? '淺色模式' : 'Light',
    dark: language === 'tc' ? '深色模式' : 'Dark',
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

  const handleSearchChange = async (value: string) => {
    setQuery(value);
    if (value.length >= 2) {
      setIsSearching(true);
      try {
        const cities = await searchCities(value);
        setResults(cities);
      } catch {
        // Toast path is not invoked here — search failures are silent so the
        // menu doesn't pile up toasts while the user is still typing.
        // The fetch layer logs via logWarn/logFailure.
      } finally {
        setIsSearching(false);
      }
    } else {
      setResults([]);
    }
  };

  const handleSelectCity = (city: GeoLocation) => {
    setDefaultCity(city);
    onCitySelect(city);
    setSearchOpen(false);
    setQuery('');
    setResults([]);
  };

  const filteredRecent = recentCities.filter(
    c => !(currentCity && c.latitude === currentCity.latitude && c.longitude === currentCity.longitude)
  ).slice(0, 3);

  // Pill options for units — short labels (the menu had verbose "(°C, km/h, mm)"
  // suffixes that don't fit in a pill; the active unit is unambiguous from
  // the rest of the UI).
  const unitOptions: { value: Units; label: string }[] = [
    { value: 'metric', label: 'Metric' },
    { value: 'us', label: 'US' },
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
          {/* Location section */}
          <DropdownMenuLabel className="text-sm text-muted-foreground font-normal px-2 py-2.5">
            {language === 'tc' ? '位置' : 'Location'}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setSearchOpen(true)} className="gap-2.5 py-3">
            <Search className="h-5 w-5" />
            {t('search.city')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRefreshLocation} disabled={isLocating} className="gap-2.5 py-3">
            <LocateFixed className={`h-5 w-5 ${isLocating ? 'animate-spin' : ''}`} />
            {t('search.useLocation')}
          </DropdownMenuItem>
          {filteredRecent.length > 0 && (
            <>
              {filteredRecent.map((city) => (
                <DropdownMenuItem key={`${city.latitude}-${city.longitude}`} onClick={() => handleSelectCity(city)} className="gap-2.5 py-3">
                  <MapPin className="h-5 w-5" />
                  {city.name}
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />

          {/* Refresh section */}
          <DropdownMenuItem onClick={handleRefreshData} disabled={isRefreshing} className="gap-2.5 py-3">
            <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('data.refresh')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Units pill toggle */}
          <PillToggle
            label={t('settings.units')}
            value={units}
            options={unitOptions}
            onChange={setUnits}
          />

          <DropdownMenuSeparator />

          {/* Theme section (3-way radio group — WCAG 4.1.2).
              Previously three DropdownMenuItems with a Check icon for the
              active one. Screen-reader users heard three unlabeled
              checkboxes instead of a 1-of-3 radio group. The Radix
              RadioGroup sets role="radiogroup" + role="radio" +
              aria-checked, and the ItemIndicator dot replaces the
              hand-managed Check icon. */}
          <DropdownMenuLabel className="text-sm text-muted-foreground font-normal px-2 py-2.5">
            {language === 'tc' ? '主題' : 'Theme'}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as 'light' | 'dark' | 'auto')}
          >
            <DropdownMenuRadioItem value="light" className="gap-2.5 py-3">
              <Sun className="h-5 w-5" />
              {themeLabels.light}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark" className="gap-2.5 py-3">
              <Moon className="h-5 w-5" />
              {themeLabels.dark}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="auto" className="gap-2.5 py-3">
              <SunMoon className="h-5 w-5" />
              {themeLabels.auto}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          {/* Language pill toggle */}
          <PillToggle
            label={language === 'tc' ? '語言' : 'Language'}
            value={language}
            options={languages}
            onChange={setLanguage}
          />
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
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label={t('search.placeholder')}
              className="border-0 bg-transparent p-0 h-auto text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {isSearching ? (
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
            ) : query.length >= 2 ? (
              <div className="p-4 text-center text-muted-foreground">{t('search.noResults')}</div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}