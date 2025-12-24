import { useState, useEffect, useRef } from "react";
import { Search, MapPin, X, LocateFixed } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchCities, GeoLocation, setDefaultCity, getUserLocation, reverseGeocode } from "@/lib/weather";
import { toast } from "sonner";

interface CitySearchProps {
  currentCity: GeoLocation | null;
  onCitySelect: (city: GeoLocation) => void;
}

export function CitySearch({ currentCity, onCitySelect }: CitySearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleRefreshLocation = async () => {
    setIsLocating(true);
    try {
      const coords = await getUserLocation();
      const location = await reverseGeocode(coords.latitude, coords.longitude);
      if (location) {
        setDefaultCity(location);
        onCitySelect(location);
        toast.success(`Location updated to ${location.name}`);
      }
    } catch (error) {
      toast.error("Could not get your location. Please check permissions.");
      console.error("Location error:", error);
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
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
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md mx-auto">
      <div className="glass-card flex items-center gap-3 px-4 py-3">
        <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <Input
          type="text"
          placeholder="Search for a city..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border-0 bg-transparent p-0 h-auto text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {currentCity && !isOpen && (
        <div className="flex items-center justify-center gap-2 mt-3 text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span className="text-sm">
            {currentCity.name}, {currentCity.admin1 ? `${currentCity.admin1}, ` : ''}{currentCity.country}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-1"
            onClick={handleRefreshLocation}
            disabled={isLocating}
            title="Refresh to current location"
          >
            <LocateFixed className={`h-4 w-4 ${isLocating ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      )}

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 glass-card overflow-hidden z-50">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Searching...</div>
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
            <div className="p-4 text-center text-muted-foreground">No cities found</div>
          )}
        </div>
      )}
    </div>
  );
}
