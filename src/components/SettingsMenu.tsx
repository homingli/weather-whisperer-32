import { useState } from 'react';
import { Menu, Sun, Moon, SunMoon, Globe, Check, Search, LocateFixed, MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage, Language, formatString } from '@/contexts/LanguageContext';
import { searchCities, GeoLocation, getUserLocation, reverseGeocode, setDefaultCity } from '@/lib/weather';
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

export function SettingsMenu({ currentCity, recentCities, onCitySelect, onRefresh }: SettingsMenuProps) {
  const { mode, setMode } = useTheme();
  const { language, setLanguage, t } = useLanguage();
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
      toast.error(t('search.locationError'));
      console.error('Location error:', error);
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
      } catch (error) {
        console.error('Failed to search cities:', error);
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Settings</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          {/* Location section */}
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            {language === 'tc' ? '位置' : 'Location'}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setSearchOpen(true)} className="gap-2">
            <Search className="h-4 w-4" />
            {t('search.city')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRefreshLocation} disabled={isLocating} className="gap-2">
            <LocateFixed className={`h-4 w-4 ${isLocating ? 'animate-spin' : ''}`} />
            {t('search.useLocation')}
          </DropdownMenuItem>
          {filteredRecent.length > 0 && (
            <>
              {filteredRecent.map((city) => (
                <DropdownMenuItem key={`${city.latitude}-${city.longitude}`} onClick={() => handleSelectCity(city)} className="gap-2">
                  <MapPin className="h-4 w-4" />
                  {city.name}
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />

          {/* Refresh section */}
          <DropdownMenuItem onClick={handleRefreshData} disabled={isRefreshing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('data.refresh')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Theme section */}
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            {language === 'tc' ? '主題' : 'Theme'}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setMode('light')} className="gap-2">
            <Sun className="h-4 w-4" />
            {themeLabels.light}
            {mode === 'light' && <Check className="h-4 w-4 ml-auto text-primary" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode('dark')} className="gap-2">
            <Moon className="h-4 w-4" />
            {themeLabels.dark}
            {mode === 'dark' && <Check className="h-4 w-4 ml-auto text-primary" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode('auto')} className="gap-2">
            <SunMoon className="h-4 w-4" />
            {themeLabels.auto}
            {mode === 'auto' && <Check className="h-4 w-4 ml-auto text-primary" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Language section */}
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            {language === 'tc' ? '語言' : 'Language'}
          </DropdownMenuLabel>
          {languages.map((l) => (
            <DropdownMenuItem key={l.value} onClick={() => setLanguage(l.value)} className="gap-2">
              <Globe className="h-4 w-4" />
              {l.label}
              {language === l.value && <Check className="h-4 w-4 ml-auto text-primary" />}
            </DropdownMenuItem>
          ))}
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
              className="border-0 bg-transparent p-0 h-auto text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
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
