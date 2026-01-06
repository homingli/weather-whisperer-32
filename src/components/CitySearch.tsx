import { useState, useEffect, useRef } from "react";
import { Search, MapPin, X, LocateFixed, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { searchCities, GeoLocation, setDefaultCity, getUserLocation, reverseGeocode } from "@/lib/weather";
import { toast } from "sonner";
import { useLanguage, formatString } from "@/contexts/LanguageContext";

interface CitySearchProps {
  currentCity: GeoLocation | null;
  onCitySelect: (city: GeoLocation) => void;
}

export function CitySearch({ currentCity, onCitySelect }: CitySearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

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
      console.error("Location error:", error);
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsSearching(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        setIsLoading(true);
        try {
          const cities = await searchCities(query);
          setResults(cities);
          setIsOpen(true);
        } catch (error) {
          console.error("Failed to search cities:", error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (city: GeoLocation) => {
    setDefaultCity(city);
    onCitySelect(city);
    setQuery("");
    setIsOpen(false);
    setIsSearching(false);
  };

  // If we have a city and not searching, show the compact menu
  if (currentCity && !isSearching) {
    return (
      <div className="flex items-center justify-end gap-2">
        <MapPin className="h-6 w-6 text-muted-foreground" />
        <span className="text-xl font-medium text-muted-foreground">
          {currentCity.name}, {currentCity.admin1 ? `${currentCity.admin1}, ` : ''}{currentCity.country}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Menu className="h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="text-base">
            <DropdownMenuItem onClick={() => setIsSearching(true)} className="text-base py-3 px-4">
              <Search className="h-5 w-5 mr-3" />
              {t('search.city')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleRefreshLocation} disabled={isLocating} className="text-base py-3 px-4">
              <LocateFixed className={`h-5 w-5 mr-3 ${isLocating ? 'animate-spin' : ''}`} />
              {t('search.useLocation')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // Show search input
  return (
    <div ref={containerRef} className="relative w-full max-w-md mx-auto">
      <div className="glass-card flex items-center gap-3 px-4 py-3">
        <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <Input
          type="text"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border-0 bg-transparent p-0 h-auto text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
          autoFocus={isSearching}
        />
        {query ? (
          <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        ) : currentCity ? (
          <button onClick={() => setIsSearching(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 glass-card overflow-hidden z-50">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">{t('search.searching')}</div>
          ) : results.length > 0 ? (
            <ul className="divide-y divide-border/30">
              {results.map((city, index) => (
                <li key={`${city.name}-${city.latitude}-${city.longitude}-${index}`}>
                  <button
                    onClick={() => handleSelect(city)}
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
          ) : (
            <div className="p-4 text-center text-muted-foreground">{t('search.noResults')}</div>
          )}
        </div>
      )}
    </div>
  );
}
